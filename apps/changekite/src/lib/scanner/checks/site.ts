/** Site-wide checks: robots.txt, sitemap, HTTPS/TLS/HSTS, crawl limits. */
import type { CrawledPage, HttpsInfo, Issue, RobotsInfo, SitemapInfo } from "../types";

export function checkRobots(robots: RobotsInfo): Issue[] {
  const issues: Issue[] = [];
  if (robots.status !== null && robots.status >= 500) {
    issues.push({
      id: "robots-server-error",
      check: "robots",
      severity: "critical",
      page: robots.url,
      message: `robots.txt returns a server error (${robots.status})`,
      howToFix: "Google treats a 5xx robots.txt as “do not crawl anything”. Make it return 200 (or 404 if you have none).",
    });
    return issues;
  }
  if (!robots.found) {
    issues.push({
      id: "robots-missing",
      check: "robots",
      severity: "notice",
      page: robots.url,
      message: robots.error ? `robots.txt could not be fetched (${robots.error})` : "No robots.txt file",
      howToFix: "Optional, but a robots.txt with a Sitemap: line helps crawlers find your sitemap. Example:\nUser-agent: *\nAllow: /\nSitemap: https://yoursite/sitemap.xml",
    });
    return issues;
  }
  if (robots.blocksAllForEveryone) {
    issues.push({
      id: "robots-blocks-all",
      check: "robots",
      severity: "critical",
      page: robots.url,
      message: "robots.txt blocks all crawlers from the whole site",
      detail: "User-agent: * with Disallow: /",
      howToFix: "Unless the site is meant to be hidden (e.g. staging), remove “Disallow: /”. Search engines will otherwise drop your pages.",
    });
  } else if (robots.blocksChangeKiteBot) {
    issues.push({
      id: "robots-blocks-changekite",
      check: "robots",
      severity: "notice",
      page: robots.url,
      message: "robots.txt blocks ChangeKiteBot, so pages were not crawled",
      howToFix: "If you want a full audit, allow the ChangeKiteBot user agent in robots.txt.",
    });
  }
  if (robots.sitemaps.length === 0) {
    issues.push({
      id: "robots-no-sitemap",
      check: "robots",
      severity: "notice",
      page: robots.url,
      message: "robots.txt does not reference a sitemap",
      howToFix: "Add a line like “Sitemap: https://yoursite/sitemap.xml” so every crawler can find it.",
    });
  }
  return issues;
}

export function checkSitemap(sitemap: SitemapInfo, siteHosts: string[]): Issue[] {
  const issues: Issue[] = [];
  if (!sitemap.found) {
    issues.push({
      id: "sitemap-missing",
      check: "sitemap",
      severity: "warning",
      page: sitemap.url ?? sitemap.checked[0] ?? null,
      message: "No XML sitemap found",
      detail: sitemap.checked.length ? `Checked: ${sitemap.checked.join(", ")}` : undefined,
      howToFix: "Publish /sitemap.xml listing your canonical pages (most CMSs and frameworks can generate one) and reference it in robots.txt.",
    });
    return issues;
  }
  if (sitemap.error) {
    issues.push({
      id: "sitemap-invalid",
      check: "sitemap",
      severity: "warning",
      page: sitemap.url ?? null,
      message: "The sitemap could not be parsed",
      detail: sitemap.error,
      howToFix: "Serve valid XML with a <urlset> (or <sitemapindex>) root using the sitemaps.org schema, with one <loc> per <url>.",
    });
    return issues;
  }
  if (sitemap.urlCount === 0 && sitemap.childSitemaps === 0) {
    issues.push({
      id: "sitemap-empty",
      check: "sitemap",
      severity: "warning",
      page: sitemap.url ?? null,
      message: "The sitemap lists no URLs",
      howToFix: "Make sure the sitemap generator includes your published pages.",
    });
  }
  if (sitemap.urlCount > 50_000) {
    issues.push({
      id: "sitemap-too-many-urls",
      check: "sitemap",
      severity: "warning",
      page: sitemap.url ?? null,
      message: `The sitemap lists ${sitemap.urlCount} URLs (limit is 50,000 per file)`,
      howToFix: "Split it into several sitemaps under a sitemap index.",
    });
  }
  const offHost = sitemap.sampled.filter((s) => {
    try {
      return !siteHosts.includes(new URL(s.url).hostname.toLowerCase());
    } catch {
      return true;
    }
  });
  if (offHost.length) {
    issues.push({
      id: "sitemap-off-host",
      check: "sitemap",
      severity: "warning",
      page: sitemap.url ?? null,
      message: "The sitemap lists URLs on a different host",
      detail: offHost.slice(0, 3).map((s) => s.url).join(", "),
      howToFix: "A sitemap should only list URLs of the host it is served from (e.g. don't mix www and non-www, or http and https hosts).",
    });
  }
  const bad = sitemap.sampled.filter((s) => s.status === null || s.status >= 300);
  if (bad.length) {
    issues.push({
      id: "sitemap-bad-urls",
      check: "sitemap",
      severity: "warning",
      page: sitemap.url ?? null,
      message: `${bad.length} of ${sitemap.sampled.length} sampled sitemap URLs do not return 200`,
      detail: bad
        .slice(0, 5)
        .map((s) => `${s.url} (${s.status ?? s.error ?? "error"}${s.location ? ` → ${s.location}` : ""})`)
        .join("; "),
      howToFix: "List only final, indexable URLs that return 200. Remove deleted pages and replace redirected URLs with their targets.",
    });
  }
  return issues;
}

export function checkHttps(https: HttpsInfo, origin: string): Issue[] {
  const issues: Issue[] = [];
  if (!https.servesHttps) {
    issues.push({
      id: "https-missing",
      check: "https",
      severity: "critical",
      page: origin,
      message: "The site is not available over HTTPS",
      detail: https.tlsError,
      howToFix: "Install a TLS certificate (free from Let's Encrypt or your host) and redirect all http:// traffic to https://. Browsers label plain-http sites “Not secure”.",
    });
    return issues;
  }
  const tls = https.tls;
  if (tls && !tls.valid) {
    issues.push({
      id: "tls-invalid",
      check: "https",
      severity: "critical",
      page: origin,
      message: "The TLS certificate is not trusted",
      detail: tls.error,
      howToFix: "Install a certificate from a trusted authority that covers this exact hostname, including the full intermediate chain.",
    });
  } else if (tls && tls.daysRemaining !== undefined) {
    if (tls.daysRemaining < 0) {
      issues.push({
        id: "tls-expired",
        check: "https",
        severity: "critical",
        page: origin,
        message: "The TLS certificate has expired",
        detail: `Expired ${tls.validTo}`,
        howToFix: "Renew the certificate now and enable automatic renewal.",
      });
    } else if (tls.daysRemaining < 14) {
      issues.push({
        id: "tls-expiring-soon",
        check: "https",
        severity: "critical",
        page: origin,
        message: `The TLS certificate expires in ${tls.daysRemaining} days`,
        detail: `Valid until ${tls.validTo}; issued by ${tls.issuer ?? "unknown"}`,
        howToFix: "Renew it now and check why automatic renewal has not happened yet.",
      });
    } else if (tls.daysRemaining < 30) {
      issues.push({
        id: "tls-expiring",
        check: "https",
        severity: "warning",
        page: origin,
        message: `The TLS certificate expires in ${tls.daysRemaining} days`,
        detail: `Valid until ${tls.validTo}; issued by ${tls.issuer ?? "unknown"}`,
        howToFix: "Make sure automatic renewal is configured; most authorities renew around 30 days before expiry.",
      });
    }
  }
  if (https.httpRedirectsToHttps === false) {
    issues.push({
      id: "http-no-redirect",
      check: "https",
      severity: "warning",
      page: origin.replace(/^https:/, "http:"),
      message:
        https.httpStatus != null
          ? `http:// does not redirect to https:// (it returns ${https.httpStatus})`
          : "http:// does not redirect to https://",
      howToFix: "Add a permanent (301/308) redirect from every http:// URL to its https:// equivalent.",
    });
  }
  if (!https.hsts) {
    issues.push({
      id: "hsts-missing",
      check: "https",
      severity: "warning",
      page: origin,
      message: "No Strict-Transport-Security (HSTS) header",
      howToFix: "Send “Strict-Transport-Security: max-age=31536000” on HTTPS responses so browsers never fall back to plain http.",
    });
  } else {
    const m = /max-age\s*=\s*"?(\d+)/i.exec(https.hsts);
    const maxAge = m ? Number(m[1]) : 0;
    if (maxAge < 15_552_000) {
      issues.push({
        id: "hsts-short",
        check: "https",
        severity: "notice",
        page: origin,
        message: `HSTS max-age is short (${maxAge} seconds)`,
        detail: https.hsts,
        howToFix: "Once HTTPS works everywhere, raise max-age to at least 6 months (15552000), ideally a year.",
      });
    }
  }
  return issues;
}

export function checkCrawl(
  pages: CrawledPage[],
  info: { skippedByRobots: string[]; pageCapReached: boolean; timeBudgetExhausted: boolean; maxPages: number },
): Issue[] {
  const issues: Issue[] = [];
  if (info.skippedByRobots.length) {
    issues.push({
      id: "crawl-robots-skipped",
      check: "crawl",
      severity: "notice",
      page: null,
      message: `${info.skippedByRobots.length} linked URL${info.skippedByRobots.length === 1 ? " was" : "s were"} not crawled because robots.txt disallows them`,
      detail: info.skippedByRobots.slice(0, 5).join(", "),
      howToFix: "Nothing to do if that is intentional. Pages you want in search results should not be disallowed.",
    });
  }
  if (info.pageCapReached) {
    issues.push({
      id: "crawl-page-cap",
      check: "crawl",
      severity: "notice",
      page: null,
      message: `Free scan limit reached: ${info.maxPages} pages were checked`,
      howToFix: "Results cover the pages closest to your start URL. Scan a specific section by entering its URL.",
    });
  }
  if (info.timeBudgetExhausted) {
    issues.push({
      id: "crawl-time-budget",
      check: "crawl",
      severity: "notice",
      page: null,
      message: "The scan hit its time limit before every check finished",
      detail: `${pages.length} pages fetched`,
      howToFix: "Slow responses use up the budget. Check your server response times; very slow pages also hurt visitors.",
    });
  }
  return issues;
}
