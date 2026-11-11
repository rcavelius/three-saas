import type { CrawledPage, Issue, UrlStatus } from "../types";
import { contentPages } from "./content";
import { hostOf } from "../url-utils";
import { isNoindex } from "../html";

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const norm = (u: URL) => `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "") || "/"}${u.search}`;
    return norm(x) === norm(y);
  } catch {
    return a === b;
  }
}

/** Canonical targets that need a status probe (not already known). */
export function canonicalTargets(pages: CrawledPage[]): string[] {
  const out = new Set<string>();
  for (const p of contentPages(pages)) {
    for (const c of p.parsed!.canonicals) if (c.resolved && !sameUrl(c.resolved, p.finalUrl)) out.add(c.resolved);
  }
  return [...out];
}

/**
 * @param statuses status of URLs as fetched WITHOUT following redirects (crawled pages + probes).
 */
export function checkCanonicals(pages: CrawledPage[], statuses: Map<string, UrlStatus>, siteHosts: string[]): Issue[] {
  const issues: Issue[] = [];
  for (const p of contentPages(pages)) {
    const all = p.parsed!.canonicals;
    const head = all.filter((c) => c.inHead);
    const noindex = isNoindex(p.parsed!.robotsDirectives);
    if (all.length === 0) {
      if (!noindex) {
        issues.push({
          id: "canonical-missing",
          check: "canonical",
          severity: "notice",
          page: p.finalUrl,
          message: "No canonical URL declared",
          howToFix: 'Add <link rel="canonical" href="https://…/this-page"> pointing to the preferred URL of this page, so tracking parameters and duplicate paths are consolidated.',
        });
      }
      continue;
    }
    if (head.length === 0) {
      issues.push({
        id: "canonical-in-body",
        check: "canonical",
        severity: "warning",
        page: p.finalUrl,
        message: "Canonical link is outside <head> and will be ignored",
        howToFix: "Move the <link rel=\"canonical\"> into the <head>. A stray tag in the body often means an unclosed element pushed it there.",
      });
      continue;
    }
    const distinct = [...new Set(head.map((c) => c.resolved ?? `(invalid: ${c.raw ?? "no href"})`))];
    if (distinct.length > 1) {
      issues.push({
        id: "canonical-multiple",
        check: "canonical",
        severity: "warning",
        page: p.finalUrl,
        message: `${distinct.length} different canonical URLs declared`,
        detail: distinct.join(" | "),
        howToFix: "Declare exactly one canonical. With conflicting values search engines ignore all of them.",
      });
      continue;
    }
    const c = head[0]!;
    if (!c.resolved) {
      issues.push({
        id: "canonical-invalid",
        check: "canonical",
        severity: "warning",
        page: p.finalUrl,
        message: c.raw === null || c.raw.trim() === "" ? "Canonical link has no href" : "Canonical href is not a valid http(s) URL",
        detail: c.raw ? `href="${c.raw}"` : undefined,
        howToFix: "Set href to the absolute URL of the preferred version of this page.",
      });
      continue;
    }
    const self = sameUrl(c.resolved, p.finalUrl);
    if (!siteHosts.includes(hostOf(c.resolved))) {
      issues.push({
        id: "canonical-cross-host",
        check: "canonical",
        severity: "warning",
        page: p.finalUrl,
        message: "Canonical points to a different host",
        detail: c.resolved,
        howToFix: "Only point the canonical to another domain if this page is a deliberate copy of that page. Otherwise point it at this site's own URL.",
      });
    } else if (new URL(c.resolved).protocol === "http:" && new URL(p.finalUrl).protocol === "https:") {
      issues.push({
        id: "canonical-http",
        check: "canonical",
        severity: "warning",
        page: p.finalUrl,
        message: "Canonical points to the insecure http:// version",
        detail: c.resolved,
        howToFix: "Use the https:// URL in the canonical.",
      });
    }
    if (noindex && !self) {
      issues.push({
        id: "canonical-noindex-conflict",
        check: "canonical",
        severity: "warning",
        page: p.finalUrl,
        message: "Page is noindex but also canonicalises to another URL",
        detail: `canonical: ${c.resolved}`,
        howToFix: "Pick one signal: either noindex the page, or keep it indexable and let the canonical consolidate it. Mixed signals can drop the target page too.",
      });
    }
    if (!self) {
      const st = statuses.get(c.resolved);
      if (st && st.status !== null && st.status >= 300 && st.status < 400) {
        issues.push({
          id: "canonical-redirects",
          check: "canonical",
          severity: "warning",
          page: p.finalUrl,
          message: `Canonical URL redirects (${st.status})`,
          detail: `${c.resolved} → ${st.location ?? "?"}`,
          howToFix: "Point the canonical directly at the final URL, not one that redirects.",
        });
      } else if (st && st.status !== null && st.status >= 400) {
        issues.push({
          id: "canonical-broken",
          check: "canonical",
          severity: "critical",
          page: p.finalUrl,
          message: `Canonical URL returns ${st.status}`,
          detail: c.resolved,
          howToFix: "Point the canonical at a live page (usually this page itself). A canonical to an error page can drop this page from search results.",
        });
      } else if (st && st.status === null && st.errorCode && st.errorCode !== "SKIPPED") {
        issues.push({
          id: "canonical-unreachable",
          check: "canonical",
          severity: "warning",
          page: p.finalUrl,
          message: "Canonical URL could not be fetched",
          detail: `${c.resolved} (${st.error ?? st.errorCode})`,
          howToFix: "Check that the canonical URL is spelled correctly and reachable.",
        });
      }
    }
  }
  return issues;
}
