import type { CrawledPage, Issue, UrlStatus } from "../types";

function sourcesOf(pages: CrawledPage[], target: string, kind: "internal" | "external"): string[] {
  const out: string[] = [];
  for (const p of pages) {
    const list = kind === "internal" ? p.internalLinks : p.externalLinks;
    if (list.includes(target)) out.push(p.finalUrl);
  }
  return out;
}

function fmtSources(src: string[]): string {
  if (!src.length) return "";
  const shown = src.slice(0, 3).join(", ");
  return `Linked from: ${shown}${src.length > 3 ? ` and ${src.length - 3} more` : ""}`;
}

/** Status of the start page and redirect chains. */
export function checkPageStatus(pages: CrawledPage[], startUrl: string): Issue[] {
  const issues: Issue[] = [];
  const start = pages.find((p) => p.url === startUrl);
  if (start) {
    if (start.status === null) {
      issues.push({
        id: "start-unreachable",
        check: "status",
        severity: "critical",
        page: startUrl,
        message: "The start page could not be loaded",
        detail: start.error,
        howToFix: "Check that the site is online, the domain resolves and the certificate is valid. Visitors get the same error.",
      });
    } else if (start.status >= 400) {
      issues.push({
        id: "start-error-status",
        check: "status",
        severity: "critical",
        page: startUrl,
        message: `The start page returns HTTP ${start.status}`,
        howToFix: "Make the homepage return 200 OK. Error statuses tell search engines the page does not exist.",
      });
    }
  }
  for (const p of pages) {
    if (p.redirects.length >= 2) {
      issues.push({
        id: "redirect-chain",
        check: "status",
        severity: "notice",
        page: p.url,
        message: `${p.redirects.length} redirects before reaching the final page`,
        detail: [...p.redirects.map((r) => `${r.url} (${r.status})`), p.finalUrl].join(" → "),
        howToFix: "Redirect straight to the final URL in one hop, and update internal links to point at it directly.",
      });
    }
    if (p.status !== null && p.status >= 200 && p.status < 300 && !p.isHtml && p.url === startUrl) {
      issues.push({
        id: "start-not-html",
        check: "status",
        severity: "warning",
        page: p.url,
        message: `The start page is not HTML (${p.contentType || "unknown type"})`,
        howToFix: "Serve the homepage with Content-Type: text/html.",
      });
    }
  }
  return issues;
}

/**
 * @param internalStatus status per internal URL WITHOUT following redirects (crawled pages + HEAD/GET probes).
 */
export function checkInternalLinks(pages: CrawledPage[], internalStatus: Map<string, UrlStatus>): Issue[] {
  const issues: Issue[] = [];
  const allTargets = new Set(pages.flatMap((p) => p.internalLinks));
  const redirecting: string[] = [];
  const notFetched: string[] = [];
  for (const target of allTargets) {
    const st = internalStatus.get(target);
    if (!st) continue;
    const src = sourcesOf(pages, target, "internal");
    if (st.status === null) {
      if (st.errorCode === "SKIPPED" || st.errorCode === "ROBOTS") continue;
      if (st.errorCode?.startsWith("BLOCKED_")) {
        notFetched.push(target);
        continue;
      }
      issues.push({
        id: "internal-link-unreachable",
        check: "internal-links",
        severity: "warning",
        page: src[0] ?? null,
        message: `Internal link could not be loaded: ${target}`,
        detail: [st.error, fmtSources(src)].filter(Boolean).join(". "),
        howToFix: "Open the URL yourself. If it times out or errors, fix the server or remove the link.",
      });
    } else if (st.status === 401 || st.status === 403) {
      issues.push({
        id: "internal-link-restricted",
        check: "internal-links",
        severity: "notice",
        page: src[0] ?? null,
        message: `Internal link requires authorisation (${st.status}): ${target}`,
        detail: fmtSources(src),
        howToFix: "Fine if the page is meant to be private. Otherwise check the server's access rules.",
      });
    } else if (st.status >= 400) {
      issues.push({
        id: "internal-link-broken",
        check: "internal-links",
        severity: "critical",
        page: src[0] ?? null,
        message: `Broken internal link (${st.status}): ${target}`,
        detail: fmtSources(src),
        howToFix:
          st.status >= 500
            ? "The server errors on this URL. Check the server logs, then fix the page or remove the link."
            : "Update the link to the correct URL, restore the page, or add a 301 redirect from the old URL to its replacement.",
      });
    } else if (st.status >= 300 && st.status < 400) {
      redirecting.push(`${target} → ${st.location ?? "?"}`);
    }
  }
  if (notFetched.length) {
    issues.push({
      id: "internal-link-nonstandard",
      check: "internal-links",
      severity: "notice",
      page: null,
      message: `${notFetched.length} internal link${notFetched.length === 1 ? "" : "s"} use a non-standard port or address and were not checked`,
      detail: notFetched.slice(0, 5).join("; ") + (notFetched.length > 5 ? ` (+${notFetched.length - 5} more)` : ""),
      howToFix: "SiteProof only fetches ports 80 and 443 on public addresses. Many firewalls block other ports, so check that these links work for visitors.",
    });
  }
  if (redirecting.length) {
    issues.push({
      id: "internal-link-redirect",
      check: "internal-links",
      severity: "notice",
      page: null,
      message: `${redirecting.length} internal link target${redirecting.length === 1 ? "" : "s"} redirect`,
      detail: redirecting.slice(0, 5).join("; ") + (redirecting.length > 5 ? ` (+${redirecting.length - 5} more)` : ""),
      howToFix: "Link directly to the final URL. Each redirect adds a round-trip and dilutes link signals (often an http:// or missing trailing slash).",
    });
  }
  return issues;
}

const UNVERIFIABLE = new Set([401, 403, 429, 999]);

export function checkExternalLinks(pages: CrawledPage[], externalStatus: Map<string, UrlStatus>): Issue[] {
  const issues: Issue[] = [];
  const unverified: string[] = [];
  const blocked: string[] = [];
  for (const [target, st] of externalStatus) {
    const src = sourcesOf(pages, target, "external");
    if (st.status !== null) {
      if (UNVERIFIABLE.has(st.status)) unverified.push(`${target} (${st.status})`);
      else if (st.status >= 400) {
        issues.push({
          id: st.status >= 500 ? "external-link-server-error" : "external-link-broken",
          check: "external-links",
          severity: "warning",
          page: src[0] ?? null,
          message: `External link returns ${st.status}: ${target}`,
          detail: fmtSources(src),
          howToFix:
            st.status >= 500
              ? "The other site returned a server error; it may be temporary. Re-check later and replace the link if it persists."
              : "Replace the link with the page's new address, an archived copy, or remove it.",
        });
      }
      continue;
    }
    const code = st.errorCode ?? "";
    if (code === "DNS_FAILURE") {
      issues.push({
        id: "external-link-dns",
        check: "external-links",
        severity: "warning",
        page: src[0] ?? null,
        message: `External link's domain does not resolve: ${target}`,
        detail: fmtSources(src),
        howToFix: "The domain may have expired or been mistyped. Fix or remove the link.",
      });
    } else if (code === "TLS_ERROR") {
      issues.push({
        id: "external-link-tls",
        check: "external-links",
        severity: "warning",
        page: src[0] ?? null,
        message: `External link has a certificate problem: ${target}`,
        detail: [st.error, fmtSources(src)].filter(Boolean).join(". "),
        howToFix: "Visitors will see a security warning. Link to a working https URL or remove the link.",
      });
    } else if (code.startsWith("BLOCKED_") || code === "INVALID_URL") {
      blocked.push(target);
    } else {
      unverified.push(`${target} (${st.error ?? code})`);
    }
  }
  if (unverified.length) {
    issues.push({
      id: "external-link-unverified",
      check: "external-links",
      severity: "notice",
      page: null,
      message: `${unverified.length} external link${unverified.length === 1 ? "" : "s"} could not be verified`,
      detail: unverified.slice(0, 6).join("; ") + (unverified.length > 6 ? ` (+${unverified.length - 6} more)` : ""),
      howToFix: "These sites refused automated checks (403/429), timed out or reset the connection. That is common for bot-protected sites; open them in a browser to confirm they work.",
    });
  }
  if (blocked.length) {
    issues.push({
      id: "external-link-private",
      check: "external-links",
      severity: "notice",
      page: null,
      message: `${blocked.length} link${blocked.length === 1 ? "" : "s"} point to private, local or non-standard addresses`,
      detail: blocked.slice(0, 6).join("; "),
      howToFix: "Links to localhost, intranet hosts, raw IPs or unusual ports don't work for visitors. We do not fetch them for security reasons.",
    });
  }
  return issues;
}
