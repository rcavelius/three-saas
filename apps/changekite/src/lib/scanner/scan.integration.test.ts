/**
 * End-to-end crawl against a real node:http fixture on 127.0.0.1. Uses the test-only loopback policy and a static
 * resolver, so every request still goes through safeFetch's validation, DNS pinning and redirect handling.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { safeFetch, SafeFetchError } from "@repo/security";
import { createLoopbackTestPolicy, staticResolver } from "@repo/security/testing";
import { runScan } from "./scan";
import type { ScanDeps, ScanProgress, ScanReport } from "./types";

let server: http.Server;
let port = 0;
const requests: { host: string; method: string; path: string; ua: string }[] = [];

const SITE = "site.example.com";
const desc = (s: string) => `<meta name="description" content="${s} ${"This fixture page exists to test the ChangeKite crawler end to end.".slice(0, 70)}">`;

function routes(host: string, path: string, origin: string): { status: number; headers?: Record<string, string>; body?: string } {
  if (host.startsWith("ext.example.net")) {
    if (path === "/dead") return { status: 404, body: "gone" };
    return { status: 200, body: "<title>ok</title>" };
  }
  if (host.startsWith("shy.example.org")) return { status: 403, body: "bots not welcome" };
  switch (path) {
    case "/robots.txt":
      return {
        status: 200,
        headers: { "content-type": "text/plain" },
        body: `User-agent: *\nDisallow: /private\n\nSitemap: ${origin}/sitemap.xml\n`,
      };
    case "/sitemap.xml":
      return {
        status: 200,
        headers: { "content-type": "application/xml" },
        body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url><url><loc>${origin}/about</loc></url><url><loc>${origin}/gone</loc></url></urlset>`,
      };
    case "/":
      return {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: `<!doctype html><html><head><title>Fixture Home</title>${desc("Home.")}<link rel="canonical" href="/"></head><body>
          <a href="/about">About</a> <a href="/products">Products</a> <a href="/missing">Missing</a>
          <a href="/private/secret">Secret</a> <a href="/old">Old</a> <a href="/deep/1">Deep</a> <a href="/report.pdf">PDF</a>
          <a href="http://ext.example.net/dead">dead external</a> <a href="http://ext.example.net/ok">ok external</a>
          <a href="http://shy.example.org/">bot-blocking external</a> <a href="http://localhost/admin">local</a>
          <a href="mailto:x@example.com">mail</a>
          <img src="/logo.png"> <img src="/spacer.gif" alt=""> <img src="/team.jpg" alt="Our team">
        </body></html>`,
      };
    case "/about":
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><head><title>Company</title><link rel="canonical" href="${origin}/gone"></head><body><a href="/">Home</a><img src="/a.png"></body></html>`,
      };
    case "/products":
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><head><title>Company</title>${desc("Products.")}<meta name="robots" content="noindex"><link rel="canonical" href="http://other.example.com/products"></head><body><a href="/">Home</a></body></html>`,
      };
    case "/old":
      return { status: 301, headers: { location: "/about" } };
    case "/deep/1":
    case "/deep/2":
    case "/deep/3": {
      const n = Number(path.split("/")[2]);
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: `<html><head><title>Deep page ${n} of the fixture site</title>${desc(`Deep ${n}.`)}<link rel="canonical" href="${path}"></head><body><a href="/deep/${n + 1}">next</a></body></html>`,
      };
    }
    case "/deep/4":
      return { status: 200, headers: { "content-type": "text/html" }, body: "<title>Too deep to crawl</title>" };
    case "/report.pdf":
      return { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF-1.4" };
    default:
      return { status: 404, headers: { "content-type": "text/html" }, body: "<title>Not found</title>" };
  }
}

function makeDeps(): ScanDeps {
  const policy = createLoopbackTestPolicy();
  const resolver = staticResolver({
    [SITE]: ["127.0.0.1"],
    "ext.example.net": ["127.0.0.1"],
    "shy.example.org": ["127.0.0.1"],
  });
  return {
    // External fixture hosts are on port 80 in the HTML; rewrite them to the fixture port (same server, Host-routed).
    fetch: (url, o) => {
      const u = new URL(url);
      if (u.hostname !== SITE && !u.port && u.hostname.endsWith(".example.net")) u.port = String(port);
      if (u.hostname !== SITE && !u.port && u.hostname.endsWith(".example.org")) u.port = String(port);
      return safeFetch(u.href, { ...o, onOversize: o.onOversize ?? "truncate", policy, resolver, userAgent: "ChangeKiteBot/1.0 (+http://test/bot)" });
    },
    inspectTls: async () => {
      throw new SafeFetchError("TLS_ERROR", "TLS connection failed: ECONNREFUSED");
    },
  };
}

let report: ScanReport;
const progress: ScanProgress[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const host = req.headers.host ?? "";
    const path = new URL(req.url ?? "/", "http://x").pathname;
    requests.push({ host, method: req.method ?? "", path, ua: String(req.headers["user-agent"] ?? "") });
    const r = routes(host, path, `http://${SITE}:${port}`);
    res.writeHead(r.status, r.headers ?? {});
    res.end(req.method === "HEAD" ? undefined : r.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
  report = await runScan(`http://${SITE}:${port}/`, makeDeps(), {
    limits: { delayMs: 0, timeBudgetMs: 20_000 },
    onProgress: (p) => progress.push(p),
  });
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const has = (id: string) => report.issues.filter((i) => i.id === id);

describe("full scan against the fixture site", () => {
  it("crawls same-site HTML pages within depth 3 and identifies as ChangeKiteBot", () => {
    const crawled = report.pages.map((p) => new URL(p.url).pathname).sort();
    expect(crawled).toEqual(["/", "/about", "/deep/1", "/deep/2", "/deep/3", "/missing", "/old", "/products"].sort());
    expect(requests.every((r) => r.ua.startsWith("ChangeKiteBot/1.0"))).toBe(true);
    expect(report.stats.pagesCrawled).toBe(8);
  });

  it("respects robots.txt Disallow", () => {
    expect(requests.some((r) => r.path.startsWith("/private"))).toBe(false);
    expect(report.stats.pagesSkippedByRobots).toBe(1);
    expect(has("crawl-robots-skipped")).toHaveLength(1);
  });

  it("never fetches private/local link targets", () => {
    expect(requests.some((r) => r.host.startsWith("localhost"))).toBe(false);
    expect(has("external-link-private")[0]?.detail).toContain("http://localhost/admin");
  });

  it("finds the broken internal link with its source page", () => {
    const broken = has("internal-link-broken");
    expect(broken.map((i) => i.message)).toEqual([`Broken internal link (404): http://${SITE}:${port}/missing`]);
    expect(broken[0]!.page).toBe(`http://${SITE}:${port}/`);
    expect(broken[0]!.severity).toBe("critical");
  });

  it("reports the redirecting internal link and probes the too-deep page instead of crawling it", () => {
    expect(has("internal-link-redirect")[0]?.detail).toContain("/old");
    expect(report.stats.internalUrlsProbed).toBeGreaterThanOrEqual(2); // /deep/4 and /report.pdf
    expect(requests.some((r) => r.path === "/deep/4" && r.method === "HEAD")).toBe(true);
    expect(requests.some((r) => r.path === "/report.pdf" && r.method === "HEAD")).toBe(true);
  });

  it("checks external links: 404 broken, 403 could-not-verify", () => {
    expect(has("external-link-broken").map((i) => i.message)).toEqual([`External link returns 404: http://ext.example.net/dead`]);
    expect(has("external-link-unverified")[0]?.detail).toContain("shy.example.org");
  });

  it("flags missing alt (but not alt=\"\")", () => {
    const alt = has("img-alt-missing");
    expect(alt.map((i) => new URL(i.page!).pathname).sort()).toEqual(["/", "/about"]);
    expect(alt.find((i) => i.page!.endsWith(":" + port + "/"))!.message).toBe("1 image without an alt attribute");
  });

  it("flags titles and descriptions", () => {
    expect(has("title-duplicate")).toHaveLength(0); // the duplicate is on a noindex page
    expect(has("description-missing").map((i) => new URL(i.page!).pathname)).toEqual(["/about"]);
  });

  it("flags the bad canonicals", () => {
    expect(has("canonical-broken").map((i) => new URL(i.page!).pathname)).toEqual(["/about"]);
    expect(has("canonical-cross-host").map((i) => new URL(i.page!).pathname)).toEqual(["/products"]);
    expect(has("canonical-noindex-conflict").map((i) => new URL(i.page!).pathname)).toEqual(["/products"]);
    expect(report.issues.filter((i) => i.check === "canonical" && i.page?.includes("/deep/"))).toEqual([]);
  });

  it("reads robots.txt and the sitemap it references, and samples listed URLs", () => {
    expect(report.robots.found).toBe(true);
    expect(report.robots.sitemaps).toEqual([`http://${SITE}:${port}/sitemap.xml`]);
    expect(report.sitemap.found).toBe(true);
    expect(report.sitemap.urlCount).toBe(3);
    const bad = has("sitemap-bad-urls");
    expect(bad).toHaveLength(1);
    expect(bad[0]!.detail).toContain("/gone (404)");
  });

  it("reports missing HTTPS for a plain-http site", () => {
    expect(has("https-missing")).toHaveLength(1);
    expect(report.checks.find((c) => c.id === "https")!.status).toBe("fail");
  });

  it("produces a score, counts and progress events", () => {
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThan(100);
    expect(report.counts.critical).toBeGreaterThan(0);
    expect(progress.some((p) => p.type === "page")).toBe(true);
    expect(progress.some((p) => p.type === "phase" && p.phase === "sitemap")).toBe(true);
    expect(JSON.parse(JSON.stringify(report)).version).toBe(1);
  });
});

describe("crawl limits", () => {
  it("stops at the page cap", async () => {
    const r = await runScan(`http://${SITE}:${port}/`, makeDeps(), { limits: { delayMs: 0, maxPages: 3, timeBudgetMs: 20_000 } });
    expect(r.stats.pagesCrawled).toBe(3);
    expect(r.stats.pageCapReached).toBe(true);
    expect(r.issues.some((i) => i.id === "crawl-page-cap")).toBe(true);
  });

  it("refuses a loopback target with the production policy", async () => {
    const { createProductionDeps } = await import("./deps");
    const r = await runScan(`http://127.0.0.1:${port}/`, createProductionDeps("http://test"), { limits: { delayMs: 0, timeBudgetMs: 5_000 } });
    expect(r.issues.some((i) => i.id === "start-unreachable")).toBe(true);
    expect(r.pages[0]!.error).toMatch(/not allowed|not publicly routable/);
  });
});
