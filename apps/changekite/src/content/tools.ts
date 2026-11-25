/**
 * One landing page per search people actually type ("broken link checker", "robots.txt checker", ...). Each page
 * names the scanner checks (CheckId) and rule ids that do the job, and every number on it comes from the scanner's
 * FREE_LIMITS or the billing catalog, so a page can only promise what the scanner does. tools.test.ts pins this.
 */
import { CHANGEKITE_CATALOG, getPass, paidPlans, type PlanDef } from "@repo/billing";
import type { CheckId } from "@/lib/scanner/types";
import type { ChangeKind } from "@/lib/monitoring/diff";
import { FREE_LIMITS } from "@/lib/scanner/scan";
import { price } from "@/lib/marketing";

export interface ToolPage {
  slug: string;
  /** <title>: the phrase people type. */
  title: string;
  h1: string;
  description: string;
  intro: string;
  /** Scanner checks that do the job (ids from scanner/types CheckId; rendered with their /docs explanation). */
  checks: CheckId[];
  /** Issue rule ids the page talks about; each must exist in the scanner source. */
  rules: string[];
  /** Monitoring pages: the change kinds that trigger an alert email (monitoring/diff ChangeKind). */
  alertKinds?: ChangeKind[];
  /** True when the job needs a paid plan (scheduled monitoring); the page then leads with plans, not the free scan. */
  paid?: boolean;
  howTo: string[];
  faq: { q: string; a: string }[];
  guide?: { href: string; label: string };
}

const L = FREE_LIMITS;
const plans = paidPlans(CHANGEKITE_CATALOG);
const cheapest: PlanDef = [...plans].sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents)[0]!;
const fastest: PlanDef = [...plans].sort((a, b) => (a.limits.scanFrequencyHours ?? 0) - (b.limits.scanFrequencyHours ?? 0))[0]!;
const planLine = (p: PlanDef) =>
  `${p.name} (${price(p)}/month): ${p.limits.sites} site${p.limits.sites === 1 ? "" : "s"}, up to ${p.limits.pagesPerScan!.toLocaleString("en-US")} pages per scan, re-scanned every ${p.limits.scanFrequencyHours} hours`;
/** "Solo ($19/month): 3 sites, ... or Agency ($79/month): ..." from the catalog. */
export const PLAN_SUMMARY = plans.map(planLine).join("; ");
export const FROM_PRICE = `${price(cheapest)}/month`;

const pass = getPass(CHANGEKITE_CATALOG, "report")!;
const freeIssues = CHANGEKITE_CATALOG.plans.find((p) => p.id === CHANGEKITE_CATALOG.freePlanId)!.limits.reportIssues!;
/** "$9" */
export const PASS_PRICE = `$${(pass.priceCents / 100).toFixed(pass.priceCents % 100 ? 2 : 0)}`;
const passDays = pass.durationHours / 24;
/** Shared FAQ on every free tool page: what the free report shows and what the pass adds. */
const FREE_REPORT_FAQ = {
  q: "What does the free scan show?",
  a: `The score, the result of every check and the ${freeIssues} most severe issues with how to fix them. The ${pass.name} pass (${PASS_PRICE} once, no subscription, no account) unlocks every issue with its page and fix on every report for ${passDays} days, scans of up to ${pass.limits.pagesPerScan} pages and PDF export.`,
};

const freeScope = `A free scan reads up to ${L.maxPages} pages, ${L.maxDepth} clicks deep from the address you enter, and stops after about ${Math.round(L.timeBudgetMs / 1000)} seconds.`;

export const TOOLS: ToolPage[] = [
  {
    slug: "broken-link-checker",
    title: "Free broken link checker: find dead links on your website",
    h1: "Broken link checker",
    description:
      "Find broken links on your website. The free scan tests every link, counts the dead ones and shows the worst; the full list with the page each is on is in the report.",
    intro:
      "Enter your homepage and ChangeKite follows the links on your site the way a crawler does. Every internal link is tested, outbound links are checked too, and each broken one is listed with its HTTP status and the pages that link to it, so you know exactly what to edit.",
    checks: ["internal-links", "external-links"],
    rules: ["internal-link-broken", "internal-link-unreachable", "external-link-broken", "external-link-server-error", "external-link-dns", "external-link-unverified"],
    howTo: [
      "Type your homepage address in the box above and start the scan.",
      "Open the Internal links and External links sections of the report.",
      "For each broken link, edit the page listed under “Linked from”: point the link at the right URL, restore the page, or add a 301 redirect.",
      "Scan again to confirm the list is empty.",
    ],
    faq: [
      {
        q: "Which links does it check?",
        a: `Every <a href> on the pages it crawls. Links to your own site are all tested (pages it did not crawl get a light HEAD request, falling back to GET). Up to ${L.maxExternalLinks} unique outbound links per scan are checked as well.`,
      },
      {
        q: "Why is an external link marked “could not verify” instead of broken?",
        a: "Many large sites answer automated requests with 403 or 429 even when the page works in a browser. ChangeKite reports those separately so you are not sent chasing links that are fine.",
      },
      {
        q: "Does it check my whole site?",
        a: `${freeScope} The report says when the page cap or time limit was reached. Paid plans scan up to ${Math.max(...plans.map((p) => p.limits.pagesPerScan ?? 0)).toLocaleString("en-US")} pages.`,
      },
    ],
    guide: { href: "/guides/find-and-fix-broken-links", label: "Guide: how to find and fix broken links" },
  },
  {
    slug: "find-404-pages",
    title: "Find 404 pages on your website (free 404 checker)",
    h1: "Find the 404 pages on your website",
    description:
      "Find links on your site that lead to 404 Not Found and other error pages. Free scan, no account; the full report lists each dead URL and the pages linking to it.",
    intro:
      "A 404 usually means a page was moved or deleted and something still links to it. ChangeKite crawls your site, records the status of every internal URL it finds, and lists each one that answers 404, 410 or a server error, together with the pages that link to it.",
    checks: ["internal-links", "status"],
    rules: ["internal-link-broken", "start-error-status"],
    howTo: [
      "Enter your homepage above and run the free scan.",
      "In the report, open Internal links: every “Broken internal link (404)” entry is a URL on your site that returns an error.",
      "Fix the links on the pages shown under “Linked from”, or add a 301 redirect from the old address to its replacement.",
    ],
    faq: [
      {
        q: "Will it find 404 pages nothing links to?",
        a: "No. ChangeKite finds pages by following links, so it reports 404s that visitors and search engines can actually reach through your site. URLs only listed in your sitemap are sampled separately by the sitemap check.",
      },
      {
        q: "Is a 404 always critical?",
        a: "In the report, an internal link that returns any 4xx or 5xx status is marked critical, because every visitor who clicks it hits a dead end. Links that need a login (401 or 403) are only a notice.",
      },
      {
        q: "What if my homepage itself returns an error?",
        a: "Then the report leads with a critical “start page returns HTTP …” finding, because nothing else on the site can be reached.",
      },
    ],
    guide: { href: "/guides/find-and-fix-broken-links", label: "Guide: how to find and fix broken links" },
  },
  {
    slug: "redirect-chain-checker",
    title: "Redirect chain checker: find multi-hop redirects on your site",
    h1: "Redirect chain checker",
    description:
      "Find pages that take two or more redirects to load and internal links that point at redirecting URLs. Free scan; the full report lists every hop.",
    intro:
      "http:// to https:// to www to a new slug: each hop costs visitors a round-trip. ChangeKite records every redirect it follows while crawling, lists pages that need two or more hops with the full chain, and points out internal links whose target redirects, so you can link to the final URL directly.",
    checks: ["status", "internal-links"],
    rules: ["redirect-chain", "internal-link-redirect"],
    howTo: [
      "Enter your homepage above and run the scan.",
      "In Page status, each “redirects before reaching the final page” entry shows the whole chain with the status of every hop.",
      "In Internal links, the “targets redirect” entry lists links that should point at their final address.",
      "Change the redirect to go straight to the final URL in one hop, and update the links.",
    ],
    faq: [
      { q: "Is one redirect a problem?", a: "No. A single redirect is normal (for example http:// to https://). ChangeKite reports a chain when a page needs two or more redirects." },
      { q: "Does it show 301 versus 302?", a: "Yes. Each hop in the chain is listed with its URL and HTTP status code." },
      { q: "How serious is it?", a: "Redirect chains and redirecting links are notices: the pages still load, they are just slower and easy to tidy up." },
    ],
  },
  {
    slug: "mixed-content-checker",
    title: "Mixed content checker: find http:// resources on https pages",
    h1: "Mixed content checker",
    description:
      "Find scripts, stylesheets, iframes, images and forms loaded over http:// on your https pages. Free scan; the full report lists every insecure URL by page and type.",
    intro:
      "An https page that loads a script or stylesheet over plain http gets it blocked by the browser, and the page can break. ChangeKite reads the HTML of every https page it crawls and lists each http:// resource, split into active content, passive content and form actions.",
    checks: ["mixed-content"],
    rules: ["mixed-content-active", "mixed-content-passive", "mixed-content-form"],
    howTo: [
      "Enter your https homepage above and run the scan.",
      "Open the Mixed content section: each finding names the page and the http:// URLs on it.",
      "Change those URLs to https:// (or to relative URLs), or host the files yourself, then scan again.",
    ],
    faq: [
      {
        q: "Which tags are checked?",
        a: "Active content in script, stylesheet link, iframe, object and embed tags; passive content in img, srcset, audio, video and source; and form actions.",
      },
      { q: "Which findings are critical?", a: "Active content and forms that post over http are critical. Images and media over http are a warning." },
      {
        q: "Does it find mixed content added by JavaScript?",
        a: "No. ChangeKite reads the HTML your server sends and does not run JavaScript, so resources injected later by scripts are not seen.",
      },
    ],
  },
  {
    slug: "canonical-tag-checker",
    title: "Canonical tag checker: test rel=canonical on every page",
    h1: "Canonical tag checker",
    description:
      "Check the rel=canonical tag on every page of your site: missing, multiple, invalid, cross-host, http, redirecting or broken canonicals, and noindex conflicts.",
    intro:
      "A wrong canonical can quietly drop a page from search results. ChangeKite reads the canonical in each page’s <head> and in the Link HTTP header, resolves it, requests the target without following redirects, and reports anything that sends search engines a mixed signal.",
    checks: ["canonical"],
    rules: [
      "canonical-missing",
      "canonical-multiple",
      "canonical-in-body",
      "canonical-invalid",
      "canonical-cross-host",
      "canonical-http",
      "canonical-noindex-conflict",
      "canonical-redirects",
      "canonical-broken",
    ],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open Canonical URLs in the report to see each finding with the page it was found on.",
      "Point each canonical at the final, indexable https URL of the page (usually the page itself), with one tag in <head>.",
    ],
    faq: [
      { q: "Are relative canonical URLs fine?", a: "Yes. They are resolved against the page address (and any <base href>) before they are checked." },
      { q: "What counts as a broken canonical?", a: "A canonical whose target returns 4xx or 5xx. That is critical; a target that redirects is a warning." },
      { q: "Is a missing canonical an error?", a: "It is only a notice. Pages without a canonical work; adding a self-referencing one removes ambiguity about duplicate URLs." },
    ],
  },
  {
    slug: "sitemap-checker",
    title: "XML sitemap checker: validate your sitemap.xml for free",
    h1: "XML sitemap checker",
    description:
      "Find and validate your XML sitemap: parse errors, empty sitemaps, the 50,000 URL limit, URLs on another host, and listed pages that redirect or error.",
    intro:
      "ChangeKite looks for your sitemap in robots.txt, then at /sitemap.xml and /sitemap_index.xml. It checks that the file is a well-formed <urlset> or <sitemapindex>, opens child sitemaps of an index, and samples listed URLs to make sure they really return 200.",
    checks: ["sitemap"],
    rules: ["sitemap-missing", "sitemap-invalid", "sitemap-empty", "sitemap-too-many-urls", "sitemap-off-host", "sitemap-bad-urls"],
    howTo: [
      "Enter your homepage above (not the sitemap URL) and run the scan.",
      "Open XML sitemap in the report: it shows which sitemap was found, how many URLs it lists, and any problems.",
      "Fix the generator or file, and add a Sitemap: line to robots.txt if it is missing.",
    ],
    faq: [
      { q: "Are gzipped sitemaps supported?", a: "Yes. Gzipped sitemap files (.xml.gz) are decompressed and checked the same way." },
      { q: "Does it check every URL in the sitemap?", a: "No. It samples up to five listed URLs and checks that each returns 200 without redirecting and lives on the same host. For a sitemap index it opens up to three child sitemaps." },
      { q: "What if I have no sitemap?", a: "The report gives a warning and explains how to add one. Small, well-linked sites still get crawled, but a sitemap helps new and large sites." },
    ],
  },
  {
    slug: "robots-txt-checker",
    title: "robots.txt checker: is your site blocking search engines?",
    h1: "robots.txt checker",
    description:
      "Check your robots.txt for a stray Disallow: / that blocks every crawler, server errors, a missing file or a missing Sitemap: line. Free, no account needed.",
    intro:
      "One leftover “Disallow: /” from a staging site can take a whole site out of search. ChangeKite fetches /robots.txt, parses it the way RFC 9309 describes (longest match wins, Allow wins ties, * and $ wildcards), and tells you whether it blocks everyone.",
    checks: ["robots"],
    rules: ["robots-blocks-all", "robots-server-error", "robots-missing", "robots-no-sitemap", "robots-blocks-changekite"],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open robots.txt in the report: a critical finding means the file blocks all crawlers or the server errors on it.",
      "Remove the blanket Disallow: / (or fix the server error) and add a Sitemap: line pointing to your sitemap.",
    ],
    faq: [
      {
        q: "Does ChangeKite obey my robots.txt?",
        a: "Yes. It follows the rules for ChangeKiteBot, or the * group when there is none, never requests disallowed URLs, and honours a Crawl-delay of up to 5 seconds.",
      },
      { q: "Why is a robots.txt server error critical?", a: "When robots.txt answers with a 5xx error, Google stops crawling the site until it can read the file again." },
      {
        q: "Is robots.txt the same as noindex?",
        a: "No. robots.txt stops crawling; noindex stops indexing. A page blocked by robots.txt can still appear in results, and a crawler that cannot fetch a page never sees its noindex.",
      },
    ],
    guide: { href: "/guides/robots-txt-blocking-search-engines", label: "Guide: robots.txt blocking search engines" },
  },
  {
    slug: "ssl-certificate-checker",
    title: "SSL certificate checker: expiry date, trust and HTTPS redirect",
    h1: "SSL certificate and HTTPS checker",
    description:
      "Check your site's SSL/TLS certificate: trusted, issued for your hostname, days until expiry, plus the http to https redirect and HSTS header. Free scan.",
    intro:
      "An expired certificate turns your whole site into a full-page browser warning. ChangeKite opens a TLS connection to your server, checks that the certificate is trusted and matches your hostname, shows how many days it has left, and checks that http:// redirects to https:// and that HSTS is set.",
    checks: ["https"],
    rules: ["https-missing", "tls-invalid", "tls-expired", "tls-expiring-soon", "tls-expiring", "http-no-redirect", "hsts-missing", "hsts-short"],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open HTTPS & certificate in the report to see the issuer, days remaining and any findings.",
      "Renew or fix the certificate, redirect http:// to https://, and add a Strict-Transport-Security header.",
    ],
    faq: [
      { q: "When does expiry become critical?", a: "Within 14 days of expiry (or once expired) it is critical; within 30 days it is a warning." },
      {
        q: "Can it warn me before my certificate expires?",
        a: `Yes, on a paid plan. Monitored sites are re-scanned on a schedule and you get an email when the certificate starts expiring within 14 days or stops being trusted. Plans start at ${FROM_PRICE}.`,
      },
      { q: "Does it check HSTS?", a: "Yes. A missing Strict-Transport-Security header is a warning, and a max-age shorter than six months is a notice." },
    ],
    guide: { href: "/guides/tls-certificate-expiry", label: "Guide: TLS certificate expiry" },
  },
  {
    slug: "title-and-meta-description-checker",
    title: "Title tag and meta description checker for your whole site",
    h1: "Title tag and meta description checker",
    description:
      "Find missing, empty, duplicate, too long or too short page titles and meta descriptions across your site in one scan; the full report lists them page by page.",
    intro:
      "Your title and meta description are the headline and snippet of your search result. ChangeKite reads them on every page it crawls, measures their length, and compares them across pages to find duplicates that make pages hard to tell apart.",
    checks: ["titles", "meta-description"],
    rules: [
      "title-missing",
      "title-empty",
      "title-multiple",
      "title-duplicate",
      "title-too-long",
      "title-too-short",
      "description-missing",
      "description-empty",
      "description-duplicate",
      "description-too-long",
      "description-too-short",
    ],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open Page titles and Meta descriptions in the report; each finding names the page.",
      "Write a unique title (roughly 10 to 60 characters) and description (roughly 50 to 160 characters) for each page.",
    ],
    faq: [
      { q: "What length does it flag?", a: "Titles longer than 60 or shorter than 10 characters, and descriptions longer than 160 or shorter than 50 characters, are flagged as notices." },
      { q: "How are duplicates found?", a: "Titles and descriptions are compared across all crawled pages, case-insensitively. Pages marked noindex are left out of the comparison." },
      { q: "Which problems are most serious?", a: "A missing or empty title is critical. A missing, empty or duplicated description, and duplicated titles, are warnings." },
    ],
  },
  {
    slug: "image-alt-text-checker",
    title: "Image alt text checker: find images missing alt attributes",
    h1: "Image alt text checker",
    description:
      "Find every image on your site that has no alt attribute. Free scan; the full report lists them per page and ignores decorative images with alt=\"\".",
    intro:
      "Screen-reader users hear alt text instead of seeing an image; without the attribute many screen readers read out the file name instead. ChangeKite looks at every <img> on the pages it crawls and lists the ones with no alt attribute, page by page.",
    checks: ["images"],
    rules: ["img-alt-missing"],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open Image alt text in the report: one finding per page lists the images without alt.",
      "Add a short description as alt text, or alt=\"\" if the image is purely decorative.",
    ],
    faq: [
      { q: "Is alt=\"\" flagged?", a: "No. An empty alt is the correct markup for decorative images, so only a missing alt attribute is reported." },
      { q: "Are hidden images checked?", a: "Images marked aria-hidden=\"true\" are skipped." },
      { q: "Is this a full accessibility audit?", a: "No. It checks one thing, alt attributes on images, in the HTML your server sends." },
    ],
  },
  {
    slug: "http-to-https-redirect-checker",
    title: "HTTP to HTTPS redirect checker: does http:// go to https://?",
    h1: "HTTP to HTTPS redirect checker",
    description:
      "Check that your site's http:// address redirects to https://. Free scan: it requests the plain-http homepage without following redirects and reports what comes back.",
    intro:
      "If someone types your domain or follows an old http:// link, your server should answer with a permanent redirect to the https:// address. ChangeKite requests http://your-host/ without following redirects and checks that it points to https://; if it does not, it reports the status code your server returned instead.",
    checks: ["https"],
    rules: ["http-no-redirect", "https-missing", "redirect-chain", "internal-link-redirect"],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open HTTPS & certificate in the report: a finding appears if http:// does not redirect to https://.",
      "Add a permanent (301/308) redirect from every http:// URL to its https:// equivalent in your server, CDN or host settings.",
      "Scan again to confirm the finding is gone.",
    ],
    faq: [
      { q: "What does it test exactly?", a: "It requests http://your-host/ without following redirects and checks that the response points to https://. If it does not, the finding shows the status your server returned." },
      { q: "How serious is a missing redirect?", a: "It is a warning. A site with no HTTPS at all is critical." },
      { q: "Does it check every http:// URL?", a: "No. It tests the homepage address. Redirect chains that need two or more hops and internal links whose target redirects are reported separately from the pages it crawls." },
    ],
  },
  {
    slug: "hsts-header-checker",
    title: "HSTS header checker: Strict-Transport-Security on your site",
    h1: "HSTS header checker",
    description:
      "Check whether your homepage sends a Strict-Transport-Security (HSTS) header and whether its max-age is long enough. Free scan, no account needed.",
    intro:
      "HSTS tells browsers to never try plain http for your site again, closing the window where someone on public Wi-Fi could tamper with the very first request. ChangeKite reads the Strict-Transport-Security header on your homepage and tells you if it is missing or if its max-age is short.",
    checks: ["https"],
    rules: ["hsts-missing", "hsts-short"],
    howTo: [
      "Enter your https homepage above and run the scan.",
      "Open HTTPS & certificate in the report: a finding appears if the header is missing or its max-age is short.",
      "Send \"Strict-Transport-Security: max-age=31536000\" on your HTTPS responses, once https works everywhere on the site.",
    ],
    faq: [
      { q: "What counts as too short?", a: "A max-age below 15,552,000 seconds (six months) is flagged as a notice. A missing header is a warning." },
      { q: "Which page is checked?", a: "The header is read on your homepage response." },
      { q: "Is it safe to turn on?", a: "Only once https works on every page and subdomain you serve, because browsers will refuse plain http for the whole max-age. That is why the report suggests it as a fix once https works everywhere." },
    ],
  },
  {
    slug: "noindex-canonical-conflict-checker",
    title: "Noindex and canonical conflict checker: mixed signals to Google",
    h1: "Noindex and canonical conflict checker",
    description:
      "Find pages that are noindex but also canonicalise to another URL, and canonicals that point at redirecting or broken pages. Free scan, no account needed.",
    intro:
      "A page that says noindex and also names a different canonical URL sends search engines two opposite instructions, and the mixed signal can drop the target page too. ChangeKite reads the robots directives and the canonical on every page it crawls and reports each page where they disagree.",
    checks: ["canonical"],
    rules: ["canonical-noindex-conflict", "canonical-redirects", "canonical-broken"],
    howTo: [
      "Enter your homepage above and run the scan.",
      "Open Canonical URLs in the report: a finding appears for each noindex page whose canonical points at a different URL.",
      "Pick one signal for each page: keep noindex and drop the canonical, or make the page indexable and let the canonical consolidate it.",
      "Scan again to confirm the finding is gone.",
    ],
    faq: [
      { q: "What exactly is flagged?", a: "A page marked noindex whose canonical resolves to a different URL than the page itself. A noindex page with a self-referencing canonical is not flagged." },
      { q: "How serious is it?", a: "It is a warning. A canonical whose target returns 4xx or 5xx is critical, and one whose target redirects is a warning." },
      { q: "Where is the canonical read from?", a: "From <head> and from the Link HTTP header of each crawled page." },
    ],
  },
  {
    slug: "sitemap-urls-redirect-or-404-checker",
    title: "Sitemap URLs that redirect or return 404: find them free",
    h1: "Sitemap URLs that redirect or return errors",
    description:
      "Find sitemap.xml URLs that redirect, return 404 or sit on another host. Free scan: ChangeKite samples listed URLs and reports each one that does not return 200.",
    intro:
      "A sitemap should list only final, indexable URLs. If it lists pages that redirect, were deleted or live on another host, search engines waste crawl time on them and learn to distrust the file. ChangeKite finds your sitemap, samples the URLs it lists and reports every sampled URL that does not return 200, with the status and the redirect target.",
    checks: ["sitemap"],
    rules: ["sitemap-bad-urls", "sitemap-off-host"],
    howTo: [
      "Enter your homepage above (not the sitemap URL) and run the scan.",
      "Open XML sitemap in the report: a finding lists sampled URLs that do not return 200, each with its status and, for redirects, where it points.",
      "Replace redirected URLs with their targets and remove deleted pages from the sitemap, or fix the generator that lists them.",
      "Scan again to confirm the finding is gone.",
    ],
    faq: [
      { q: "Which URLs are checked?", a: "A sample of the URLs the sitemap lists, up to five. The report shows each one's status and, for a redirect, where it points." },
      { q: "What counts as a problem?", a: "Any sampled URL that does not return 200, including redirects, 404s and URLs that fail to respond. The finding is a warning." },
      { q: "What about URLs on another host?", a: "A sitemap listing URLs on a different host than the one serving it, such as www and non-www mixed, is reported separately as a warning." },
    ],
  },
  {
    slug: "monitor-website-for-broken-links",
    title: "Monitor your website for broken links, with email alerts",
    h1: "Monitor your website for broken links",
    description:
      `ChangeKite re-scans your sites on a schedule and emails you when a new broken internal link appears, the site goes down or the certificate nears expiry. From ${FROM_PRICE}.`,
    intro:
      "Links break when someone renames a page, a plugin changes URLs or a product is removed. On a paid plan ChangeKite re-scans each site you add on a schedule, remembers which problems it has already told you about, and emails you only when something new goes wrong.",
    checks: ["internal-links", "status", "https"],
    rules: ["internal-link-broken", "start-unreachable", "tls-expiring-soon"],
    alertKinds: ["new_broken_links", "site_down", "cert_expiring"],
    paid: true,
    howTo: [
      "Run a free scan above to see what ChangeKite finds on your site today.",
      "Create an account and choose a plan on the pricing page.",
      "Add your site in the dashboard and pick who in your workspace gets the alert emails.",
      "Fix what the first scan found; after that you are emailed only about new problems.",
    ],
    faq: [
      { q: "How often is my site scanned?", a: `It depends on the plan: ${PLAN_SUMMARY}.` },
      {
        q: "Will I get an email after every scan?",
        a: "No. The first scan is a baseline. After that an alert is sent only when something changes: new broken internal links, a new critical issue, the site going down or coming back, the certificate starting to expire, robots.txt blocking everything, or a drop in the score of 10 points or more. Problems you already know about are not repeated.",
      },
      { q: "Can I pause alerts for a site?", a: "Yes. Each monitored site can be paused or have its alerts muted, and you choose which workspace members receive them." },
    ],
    guide: { href: "/guides/find-and-fix-broken-links", label: "Guide: how to find and fix broken links" },
  },
  {
    slug: "website-change-monitoring",
    title: "Website monitoring for SEO problems: alerts when something breaks",
    h1: "Website change monitoring",
    description:
      `Scheduled scans of the sites you look after, with an email only when something meaningful changes: downtime, new broken links, an expiring certificate. From ${FROM_PRICE}.`,
    intro:
      "Agencies and site owners rarely notice when a deploy adds a Disallow: / or a certificate stops renewing. ChangeKite runs the full inspection on each site you add on a schedule, keeps the history, and compares every scan with the last one so you hear about real changes, not the same list every day.",
    checks: ["status", "internal-links", "https", "robots"],
    rules: ["start-unreachable", "internal-link-broken", "tls-expiring-soon", "robots-blocks-all"],
    alertKinds: ["site_down", "site_up", "home_status", "new_broken_links", "new_critical", "cert_expiring", "robots_blocks_all", "score_drop"],
    paid: true,
    howTo: [
      "Run a free scan above to see the summary and top issues for one site.",
      "Choose a plan on the pricing page and create your workspace.",
      "Add the sites you look after, and invite teammates if your plan includes more than one seat.",
      "ChangeKite re-scans them on schedule and emails you when something changes, including when a critical issue is fixed.",
    ],
    faq: [
      {
        q: "What counts as a meaningful change?",
        a: "The home page becoming unreachable or reachable again, its HTTP status changing between success and error, new broken internal links, any other new critical issue, the certificate starting to expire, robots.txt starting to block all crawlers, and the score dropping by 10 points or more.",
      },
      { q: "Which plans include monitoring?", a: `${PLAN_SUMMARY}. The free plan is for one-off scans.` },
      {
        q: "Does it monitor content or visual changes?",
        a: "No. ChangeKite watches the technical health of your pages (links, status, certificate, robots.txt, titles, canonicals and the other checks in the report), not text edits or screenshots.",
      },
    ],
  },
];

// Every free tool page explains what the free report includes and what the one-time pass adds.
for (const t of TOOLS) if (!t.paid) t.faq.push(FREE_REPORT_FAQ);

export function getTool(slug: string): ToolPage | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
