/**
 * Scan orchestrator: robots.txt -> start page -> polite same-site crawl -> link/canonical probes -> sitemap ->
 * HTTPS/TLS -> pure checks -> score. All network access goes through ScanDeps (safeFetch in production).
 */
import { SafeFetchError, type SafeResponse } from "@repo/security";
import type {
  CrawledPage,
  FetchOptions,
  HttpsInfo,
  Issue,
  RobotsInfo,
  ScanDeps,
  ScanLimits,
  ScanProgress,
  ScanReport,
  SitemapInfo,
  UrlStatus,
} from "./types";
import { parsePage } from "./html";
import { BOT_TOKEN, blocksEverything, isPathAllowed, parseRobots, rulesFor, type RobotsRule } from "./robots";
import { decodeSitemapBody, parseSitemap } from "./sitemap";
import { hostOf, isAssetUrl, normalizeUrl, pathAndQuery } from "./url-utils";
import { checkImages, checkMetaDescriptions, checkTitles } from "./checks/content";
import { canonicalTargets, checkCanonicals } from "./checks/canonical";
import { checkMixedContent } from "./checks/mixed-content";
import { checkExternalLinks, checkInternalLinks, checkPageStatus } from "./checks/links";
import { checkCrawl, checkHttps, checkRobots, checkSitemap } from "./checks/site";
import { computeScore, summarizeChecks } from "./score";

export const FREE_LIMITS: ScanLimits = {
  maxPages: 25,
  maxDepth: 3,
  concurrency: 3,
  delayMs: 250,
  timeBudgetMs: 45_000,
  maxExternalLinks: 50,
  maxInternalProbes: 40,
  requestTimeoutMs: 10_000,
};

const MAX_ISSUES_PER_RULE = 25;
const SEVERITY_RANK = { critical: 0, warning: 1, notice: 2 } as const;

type FetchResult = { ok: true; res: SafeResponse } | { ok: false; error: string; code: string };

class BudgetExhausted extends Error {}

class Limiter {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly delayMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      if (this.delayMs > 0) await this.sleep(this.delayMs);
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

function capIssues(issues: Issue[]): Issue[] {
  const byId = new Map<string, Issue[]>();
  for (const i of issues) byId.set(i.id, [...(byId.get(i.id) ?? []), i]);
  const out: Issue[] = [];
  for (const [id, list] of byId) {
    out.push(...list.slice(0, MAX_ISSUES_PER_RULE));
    if (list.length > MAX_ISSUES_PER_RULE) {
      const first = list[0]!;
      out.push({
        id: `${id}-more`,
        check: first.check,
        severity: "notice",
        page: null,
        message: `${list.length - MAX_ISSUES_PER_RULE} more “${first.message.replace(/:.*$/, "")}” issues not listed`,
        howToFix: first.howToFix,
      });
    }
  }
  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function contentTypeOf(res: SafeResponse): string {
  return (res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
}

function isHtmlType(ct: string, body: Buffer): boolean {
  if (ct === "text/html" || ct === "application/xhtml+xml") return true;
  if (ct === "") return /^\s*(<!doctype html|<html)/i.test(body.subarray(0, 512).toString("utf8"));
  return false;
}

export interface RunScanOptions {
  limits?: Partial<ScanLimits>;
  onProgress?: (p: ScanProgress) => void;
  signal?: AbortSignal;
}

export async function runScan(startInput: string, deps: ScanDeps, opts: RunScanOptions = {}): Promise<ScanReport> {
  const limits: ScanLimits = { ...FREE_LIMITS, ...opts.limits };
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const progress = (p: ScanProgress) => {
    try {
      opts.onProgress?.(p);
    } catch {
      /* progress consumers must not break the scan */
    }
  };
  const signal = opts.signal;
  const startedAt = now();
  const deadline = startedAt + limits.timeBudgetMs;
  const crawlDeadline = startedAt + Math.round(limits.timeBudgetMs * 0.6);
  let timeBudgetExhausted = false;
  let crawlDelayMs = limits.delayMs;

  const startUrl = normalizeUrl(startInput);
  const startOrigin = new URL(startUrl).origin;
  let limiter = new Limiter(limits.concurrency, crawlDelayMs, sleep);

  const timeLeft = () => deadline - now();

  async function fetchUrl(url: string, o: Omit<FetchOptions, "timeoutMs" | "signal">): Promise<FetchResult> {
    if (signal?.aborted) return { ok: false, error: "Scan cancelled", code: "CANCELLED" };
    return limiter.run(async () => {
      const left = timeLeft();
      if (left < 300) {
        timeBudgetExhausted = true;
        return { ok: false, error: "Scan time limit reached", code: "SKIPPED" };
      }
      try {
        const res = await deps.fetch(url, { ...o, timeoutMs: Math.min(limits.requestTimeoutMs, left), signal });
        return { ok: true, res };
      } catch (err) {
        if (err instanceof SafeFetchError) return { ok: false, error: err.message, code: err.code };
        return { ok: false, error: (err as Error)?.message ?? "Unknown error", code: "NETWORK" };
      }
    });
  }

  // ---------- robots.txt ----------
  async function loadRobots(origin: string): Promise<{ info: RobotsInfo; rules: RobotsRule[] }> {
    const url = `${origin}/robots.txt`;
    const r = await fetchUrl(url, { method: "GET", maxBodyBytes: 512 * 1024 });
    const info: RobotsInfo = { url, status: null, found: false, sitemaps: [], blocksAllForEveryone: false, blocksSiteProofBot: false };
    if (!r.ok) {
      info.error = r.error;
      return { info, rules: [] };
    }
    info.status = r.res.status;
    if (r.res.status !== 200 || isHtmlType(contentTypeOf(r.res), r.res.body)) {
      // 4xx = no robots.txt (crawl allowed). 5xx is reported by checkRobots; we still crawl politely.
      return { info, rules: [] };
    }
    const parsed = parseRobots(r.res.text());
    info.found = true;
    info.sitemaps = [...new Set(parsed.sitemaps)].slice(0, 10);
    const star = rulesFor(parsed, "*");
    const mine = rulesFor(parsed, BOT_TOKEN);
    info.blocksAllForEveryone = star.matched !== "none" && blocksEverything(star.rules);
    info.blocksSiteProofBot = blocksEverything(mine.rules);
    if (mine.crawlDelay !== undefined) info.crawlDelaySeconds = mine.crawlDelay;
    return { info, rules: mine.rules };
  }

  progress({ type: "phase", phase: "robots", message: "Reading robots.txt" });
  let robots = await loadRobots(startOrigin);
  const applyCrawlDelay = () => {
    if (robots.info.crawlDelaySeconds !== undefined) {
      crawlDelayMs = Math.max(limits.delayMs, Math.min(5, robots.info.crawlDelaySeconds) * 1000);
      limiter = new Limiter(1, crawlDelayMs, sleep);
    }
  };
  applyCrawlDelay();
  const allowedByRobots = (url: string) => isPathAllowed(robots.rules, pathAndQuery(url));

  const pages: CrawledPage[] = [];
  const internalStatus = new Map<string, UrlStatus>();
  const siteHosts = [hostOf(startUrl)];
  const isInternal = (url: string) => siteHosts.includes(hostOf(url));
  const visited = new Set<string>();
  const parsedFinals = new Set<string>();
  const skippedByRobots: string[] = [];
  let pageCapReached = false;

  async function crawlPage(url: string, depth: number): Promise<{ links: string[] }> {
    progress({ type: "page", url, status: null, crawled: pages.length, max: limits.maxPages });
    const r = await fetchUrl(url, { method: "GET", maxBodyBytes: 2 * 1024 * 1024 });
    const page: CrawledPage = {
      url,
      finalUrl: url,
      depth,
      status: null,
      redirects: [],
      contentType: "",
      isHtml: false,
      headers: {},
      internalLinks: [],
      externalLinks: [],
    };
    if (!r.ok) {
      if (r.code === "SKIPPED" || r.code === "CANCELLED") {
        internalStatus.set(url, { status: null, error: r.error, errorCode: "SKIPPED" });
        return { links: [] };
      }
      page.error = r.error;
      page.errorCode = r.code;
      internalStatus.set(url, { status: null, error: r.error, errorCode: r.code });
      pages.push(page);
      return { links: [] };
    }
    const res = r.res;
    if (depth === 0 && url === startUrl) {
      // A redirect from the start URL to another host (typically www <-> apex) makes that host part of the site.
      const finalHost = hostOf(res.url);
      if (!siteHosts.includes(finalHost)) siteHosts.push(finalHost);
    }
    page.finalUrl = res.url;
    page.status = res.status;
    page.redirects = res.redirects;
    page.headers = res.headers;
    page.contentType = contentTypeOf(res);
    page.isHtml = isHtmlType(page.contentType, res.body);
    if (res.redirects.length) {
      const first = res.redirects[0]!;
      internalStatus.set(url, { status: first.status, location: first.location });
      res.redirects.slice(1).forEach((h) => internalStatus.set(h.url, { status: h.status, location: h.location }));
    }
    if (!internalStatus.has(res.url) || !res.redirects.length) internalStatus.set(res.url, { status: res.status });
    visited.add(res.url);
    pages.push(page);
    progress({ type: "page", url, status: res.status, crawled: pages.length, max: limits.maxPages });

    if (!page.isHtml || res.status < 200 || res.status >= 300 || !isInternal(res.url)) return { links: [] };
    // A redirect can land on a page another worker already parsed; analyse each final URL once.
    if (parsedFinals.has(res.url)) return { links: [] };
    parsedFinals.add(res.url);
    page.parsed = parsePage(res.text(), res.url, res.headers);
    const internal = new Set<string>();
    const external = new Set<string>();
    for (const l of page.parsed.links) (isInternal(l.href) ? internal : external).add(l.href);
    page.internalLinks = [...internal];
    page.externalLinks = [...external];
    return { links: page.internalLinks };
  }

  const startBlocked = !allowedByRobots(startUrl);
  if (!startBlocked) {
    // ---------- start page (alone, so a www/https redirect fixes the site hosts before crawling) ----------
    progress({ type: "phase", phase: "crawl", message: "Loading the start page" });
    visited.add(startUrl);
    const startFetch = await crawlPage(startUrl, 0);
    const startPage = pages[0];
    if (startPage && startPage.status !== null && new URL(startPage.finalUrl).origin !== startOrigin) {
      // e.g. http -> https or example.com -> www.example.com: the final origin's robots.txt is the one that counts.
      robots = await loadRobots(new URL(startPage.finalUrl).origin);
      applyCrawlDelay();
    }

    // ---------- BFS crawl ----------
    progress({ type: "phase", phase: "crawl", message: "Crawling pages" });
    const queue: { url: string; depth: number }[] = [];
    const enqueue = (links: string[], depth: number) => {
      if (depth > limits.maxDepth) return;
      for (const l of links) {
        if (visited.has(l) || isAssetUrl(l)) continue;
        visited.add(l);
        if (!allowedByRobots(l)) {
          skippedByRobots.push(l);
          internalStatus.set(l, { status: null, errorCode: "ROBOTS" });
          continue;
        }
        queue.push({ url: l, depth });
      }
    };
    enqueue(startFetch.links, 1);
    let started = pages.length;
    let active = 0;
    const worker = async () => {
      for (;;) {
        if (signal?.aborted) return;
        if (now() > crawlDeadline) {
          if (queue.length) timeBudgetExhausted = true;
          return;
        }
        const item = queue.shift();
        if (!item) {
          if (active === 0) return;
          await new Promise((r) => setTimeout(r, 15));
          continue;
        }
        if (started >= limits.maxPages) {
          pageCapReached = true;
          queue.unshift(item);
          return;
        }
        started++;
        active++;
        try {
          const { links } = await crawlPage(item.url, item.depth);
          enqueue(links, item.depth + 1);
        } finally {
          active--;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limits.concurrency, 3)) }, worker));
    if (queue.length && started >= limits.maxPages) pageCapReached = true;
  }

  // ---------- probes: internal link targets not crawled, canonical targets ----------
  if (signal?.aborted) throw new Error("Scan cancelled");
  async function probe(url: string, follow: boolean): Promise<UrlStatus> {
    let r = await fetchUrl(url, { method: "HEAD", followRedirects: follow });
    if (r.ok && (r.res.status === 405 || r.res.status === 501 || (r.res.status >= 400 && r.res.status !== 404 && r.res.status !== 410))) {
      r = await fetchUrl(url, { method: "GET", followRedirects: follow, maxBodyBytes: 64 * 1024 });
    } else if (!r.ok && (r.code === "NETWORK" || r.code === "TIMEOUT")) {
      r = await fetchUrl(url, { method: "GET", followRedirects: follow, maxBodyBytes: 64 * 1024 });
    }
    if (!r.ok) return { status: null, error: r.error, errorCode: r.code };
    const loc = r.res.headers["location"];
    let location: string | undefined;
    if (loc) {
      try {
        location = new URL(loc, url).href;
      } catch {
        location = loc;
      }
    }
    return { status: r.res.status, location };
  }

  const allInternal = [...new Set(pages.flatMap((p) => p.internalLinks))];
  const toProbe: string[] = [];
  for (const u of allInternal) {
    if (internalStatus.has(u)) continue;
    if (!allowedByRobots(u)) {
      internalStatus.set(u, { status: null, errorCode: "ROBOTS" });
      continue;
    }
    toProbe.push(u);
  }
  for (const u of canonicalTargets(pages)) if (!internalStatus.has(u) && !toProbe.includes(u)) toProbe.push(u);
  const probing = toProbe.slice(0, limits.maxInternalProbes);
  for (const u of toProbe.slice(limits.maxInternalProbes)) internalStatus.set(u, { status: null, errorCode: "SKIPPED" });
  if (probing.length) progress({ type: "phase", phase: "links", message: `Checking ${probing.length} more internal URLs` });
  let probed = 0;
  await Promise.all(
    probing.map(async (u) => {
      internalStatus.set(u, await probe(u, false));
      progress({ type: "probe", checked: ++probed, total: probing.length, what: "internal" });
    }),
  );

  // ---------- external links ----------
  const externalAll = [...new Set(pages.flatMap((p) => p.externalLinks))];
  const externalChecked = externalAll.slice(0, limits.maxExternalLinks);
  const externalStatus = new Map<string, UrlStatus>();
  if (externalChecked.length) progress({ type: "phase", phase: "external", message: `Checking ${externalChecked.length} external links` });
  let extDone = 0;
  await Promise.all(
    externalChecked.map(async (u) => {
      const st = await probe(u, true);
      if (st.errorCode !== "SKIPPED" && st.errorCode !== "CANCELLED") externalStatus.set(u, st);
      progress({ type: "probe", checked: ++extDone, total: externalChecked.length, what: "external" });
    }),
  );

  // ---------- sitemap ----------
  progress({ type: "phase", phase: "sitemap", message: "Checking the sitemap" });
  const siteOrigin = pages[0] && pages[0].status !== null ? new URL(pages[0].finalUrl).origin : startOrigin;
  const sitemap: SitemapInfo = { checked: [], found: false, urlCount: 0, childSitemaps: 0, sampled: [] };
  const candidates = robots.info.sitemaps.length
    ? robots.info.sitemaps.slice(0, 3)
    : [`${siteOrigin}/sitemap.xml`, `${siteOrigin}/sitemap_index.xml`];
  let sampleLocs: string[] = [];
  for (const candidate of candidates) {
    sitemap.checked.push(candidate);
    const r = await fetchUrl(candidate, { method: "GET", maxBodyBytes: 5 * 1024 * 1024, onOversize: "error" });
    if (!r.ok) {
      if (r.code === "BODY_TOO_LARGE") {
        Object.assign(sitemap, { found: true, url: candidate, error: "The sitemap is larger than 5 MB, so we could not check it." });
        break;
      }
      continue;
    }
    if (r.res.status !== 200) continue;
    sitemap.found = true;
    sitemap.url = r.res.url;
    let parsed;
    try {
      parsed = parseSitemap(decodeSitemapBody(r.res.body));
    } catch {
      parsed = { ok: false as const, error: "Compressed sitemap could not be decompressed." };
    }
    if (!parsed.ok) {
      sitemap.error = parsed.error;
      break;
    }
    sitemap.kind = parsed.kind;
    if (parsed.kind === "urlset") {
      sitemap.urlCount = parsed.locs.length;
      sampleLocs = parsed.locs;
    } else {
      sitemap.childSitemaps = parsed.locs.length;
      for (const child of parsed.locs.slice(0, 3)) {
        const c = await fetchUrl(child, { method: "GET", maxBodyBytes: 5 * 1024 * 1024, onOversize: "error" });
        if (!c.ok || c.res.status !== 200) continue;
        try {
          const cp = parseSitemap(decodeSitemapBody(c.res.body));
          if (cp.ok && cp.kind === "urlset") {
            sitemap.urlCount += cp.locs.length;
            sampleLocs.push(...cp.locs);
          }
        } catch {
          /* ignore broken child; the index itself parsed */
        }
      }
    }
    break;
  }
  if (sampleLocs.length) {
    const step = Math.max(1, Math.floor(sampleLocs.length / 5));
    const sample = [...new Set(Array.from({ length: Math.min(5, sampleLocs.length) }, (_, i) => sampleLocs[i * step]!))];
    sitemap.sampled = await Promise.all(
      sample.map(async (loc) => {
        let abs: string;
        try {
          abs = normalizeUrl(loc);
        } catch {
          return { url: loc, status: null, error: "invalid URL" };
        }
        const known = internalStatus.get(abs);
        const st = known && (known.status !== null || known.errorCode !== "SKIPPED") ? known : isInternal(abs) && !allowedByRobots(abs) ? { status: null, error: "disallowed by robots.txt" } : await probe(abs, false);
        return { url: abs, status: st.status, location: st.location, error: st.error };
      }),
    );
    sitemap.sampled = sitemap.sampled.filter((s) => s.error !== "Scan time limit reached" && s.error !== "disallowed by robots.txt");
  }

  // ---------- HTTPS ----------
  progress({ type: "phase", phase: "https", message: "Checking HTTPS and the certificate" });
  const siteHost = hostOf(siteOrigin);
  const https: HttpsInfo = { servesHttps: false, httpRedirectsToHttps: null };
  const homepage = pages[0];
  const httpsOrigin = `https://${new URL(siteOrigin).host}`;
  if (siteOrigin.startsWith("https:")) {
    https.servesHttps = true;
    https.hsts = homepage?.headers["strict-transport-security"] ?? null;
  }
  if (timeLeft() > 1000) {
    try {
      https.tls = await deps.inspectTls(`${httpsOrigin}/`, Math.min(8000, timeLeft()));
      https.servesHttps = true;
    } catch (err) {
      https.tlsError = err instanceof Error ? err.message : String(err);
      if (siteOrigin.startsWith("https:")) https.servesHttps = true; // page loaded over https, TLS probe just failed
    }
  }
  if (https.servesHttps && !siteOrigin.startsWith("https:") && https.hsts === undefined) {
    const h = await fetchUrl(`${httpsOrigin}/`, { method: "HEAD", followRedirects: false });
    https.hsts = h.ok ? (h.res.headers["strict-transport-security"] ?? null) : null;
  }
  if (siteOrigin.startsWith("http:") && homepage?.status != null) {
    // The start page itself ended on plain http, so http is evidently not redirected to https.
    https.httpRedirectsToHttps = false;
    https.httpStatus = homepage.status;
  } else if (!startBlocked) {
    const httpUrl = `http://${siteHost}/`;
    const h = await fetchUrl(httpUrl, { method: "HEAD", followRedirects: false });
    if (h.ok) {
      const loc = h.res.headers["location"];
      let target: string | null = null;
      try {
        target = loc ? new URL(loc, httpUrl).href : null;
      } catch {
        target = null;
      }
      https.httpStatus = h.res.status;
      https.httpRedirectsToHttps = h.res.status >= 300 && h.res.status < 400 && target !== null && target.startsWith("https:");
    }
  }
  if (!https.servesHttps) https.httpRedirectsToHttps = null;

  // ---------- checks ----------
  progress({ type: "phase", phase: "report", message: "Writing the report" });
  const rawIssues: Issue[] = [
    ...checkHttps(https, siteOrigin),
    ...checkPageStatus(pages, startUrl),
    ...checkInternalLinks(pages, internalStatus),
    ...checkTitles(pages),
    ...checkMetaDescriptions(pages),
    ...checkCanonicals(pages, internalStatus, siteHosts),
    ...checkImages(pages),
    ...checkMixedContent(pages),
    ...checkSitemap(sitemap, siteHosts),
    ...checkRobots(robots.info),
    ...checkExternalLinks(pages, externalStatus),
    ...checkCrawl(pages, { skippedByRobots, pageCapReached, timeBudgetExhausted, maxPages: limits.maxPages }),
  ];
  const issues = capIssues(rawIssues);
  const { score, grade, counts } = computeScore(issues);
  const htmlPages = pages.filter((p) => p.parsed);
  const imagesFound = htmlPages.reduce((n, p) => n + p.parsed!.images.length, 0);
  const finishedAt = now();
  const tlsNote = https.tls?.daysRemaining !== undefined ? `certificate valid ${https.tls.daysRemaining} more days` : undefined;
  const skipped = startBlocked ? (["titles", "meta-description", "canonical", "images", "mixed-content", "internal-links", "external-links"] as const) : [];

  return {
    version: 1,
    startUrl,
    finalUrl: pages[0]?.finalUrl ?? startUrl,
    origin: siteOrigin,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    limits,
    stats: {
      pagesCrawled: pages.length,
      pagesSkippedByRobots: skippedByRobots.length,
      internalUrlsFound: allInternal.length,
      internalUrlsProbed: probing.length,
      externalLinksFound: externalAll.length,
      externalLinksChecked: externalStatus.size,
      imagesFound,
      pageCapReached,
      timeBudgetExhausted,
    },
    score,
    grade,
    counts,
    checks: summarizeChecks(
      issues,
      {
        status: `${pages.length} page${pages.length === 1 ? "" : "s"} fetched`,
        "internal-links": `${allInternal.length} internal URLs`,
        "external-links": `${externalStatus.size} of ${externalAll.length} checked`,
        images: `${imagesFound} images`,
        sitemap: sitemap.found && !sitemap.error ? `${sitemap.urlCount} URLs listed` : undefined,
        https: tlsNote,
        crawl: `${pages.length} of max ${limits.maxPages} pages, depth ≤ ${limits.maxDepth}`,
      },
      [...skipped],
    ),
    issues,
    pages: pages.map((p) => ({
      url: p.url,
      finalUrl: p.finalUrl,
      status: p.status,
      depth: p.depth,
      title: p.parsed?.title ?? null,
      error: p.error,
    })),
    robots: robots.info,
    sitemap,
    https,
  };
}
