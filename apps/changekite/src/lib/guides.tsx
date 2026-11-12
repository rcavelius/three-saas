/** Original guides (content + structured data). Plain facts, no filler; each links to the check it relates to. */
import type { ReactNode } from "react";
import Link from "next/link";

export interface Guide {
  slug: string;
  title: string;
  description: string;
  updated: string;
  /** Optional HowTo steps for structured data (also rendered as the "Steps" list). */
  steps?: { name: string; text: string }[];
  body: ReactNode;
}

export const GUIDES: Guide[] = [
  {
    slug: "find-and-fix-broken-links",
    title: "How to find and fix broken internal links",
    description: "Why internal links break, three ways to find them, and how to choose between updating the link, restoring the page and a 301 redirect.",
    updated: "2026-11-11",
    steps: [
      { name: "Crawl the site", text: "Run a crawler such as ChangeKite over the site and list every internal link that answers 4xx or 5xx, with the pages that link to it." },
      { name: "Check what search engines saw", text: "In Google Search Console, open Pages and filter by “Not found (404)” to see URLs Google tried and failed to load." },
      { name: "Decide per URL", text: "If the page moved, link to the new address and add a 301 redirect from the old one; if it was deleted on purpose, remove the links; if it was removed by mistake, restore it." },
      { name: "Update links at the source", text: "Change the links in menus, templates and content to the final URL so visitors do not depend on redirects." },
      { name: "Re-scan", text: "Run the crawl again and confirm the broken links and any new redirect chains are gone." },
    ],
    body: (
      <>
        <p>
          A broken internal link is a link from one of your pages to another page on the same site that answers with an error, usually 404 Not
          Found. Visitors hit a dead end, and search engine crawlers waste visits on addresses that do not exist.
        </p>
        <h2>Why links break</h2>
        <ul>
          <li>A page was renamed (a new slug or category) and the old address was not redirected.</li>
          <li>A page was deleted but menus, footers or older articles still point to it.</li>
          <li>Typos and small differences: a missing trailing slash on a server that treats <code>/about</code> and <code>/about/</code> differently, upper-case letters, or a stray space.</li>
          <li>Links copied from a staging or local site (<code>localhost</code>, <code>staging.</code> hostnames).</li>
          <li>A server error (5xx) on one template, which looks like a broken link from the outside.</li>
        </ul>
        <h2>Fix or redirect?</h2>
        <p>
          Use a <strong>301 (permanent) redirect</strong> when the content moved: it tells browsers and search engines the new address and passes
          the old URL&rsquo;s links on. Use 302 only for a genuinely temporary move. Do not redirect deleted pages to the home page; search engines
          treat that like a 404 anyway (a &ldquo;soft 404&rdquo;), and visitors are confused.
        </p>
        <p>
          Redirects are a safety net, not the fix. Update the links themselves so each click reaches the final page in one request, and avoid chains
          such as <code>http://</code> → <code>https://</code> → <code>www</code> → new slug.
        </p>
        <p>
          ChangeKite reports broken internal links as critical, lists up to three pages that link to each one, and flags redirecting internal links
          separately. See <Link href="/docs#internal-links">how the internal link check works</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "tls-certificate-expiry",
    title: "Stop your HTTPS certificate from expiring unnoticed",
    description: "What happens when a TLS certificate expires, why lifetimes are getting shorter, and a checklist for renewal that does not depend on remembering.",
    updated: "2026-11-11",
    body: (
      <>
        <p>
          When the certificate expires, browsers show a full-page security warning instead of your site. Most visitors leave, and API clients
          simply fail. Nothing on your server needs to break for this to happen: the date passes and the warning starts.
        </p>
        <h2>Lifetimes are getting shorter</h2>
        <p>
          Publicly trusted certificates already have a maximum lifetime set by the CA/Browser Forum, and a 2025 decision shortens it in steps:
          200 days from March 2026, 100 days from March 2027 and 47 days from March 2029. Manual renewal once a year is no longer an option;
          renewal has to be automatic.
        </p>
        <h2>Checklist</h2>
        <ul>
          <li>
            <strong>Automate issuance and renewal</strong> with ACME: your host&rsquo;s built-in certificates, Caddy, or certbot with its renewal
            timer enabled. Let&rsquo;s Encrypt certificates last 90 days and are renewed around 30 days before expiry.
          </li>
          <li>
            <strong>Cover every hostname</strong> people use: both <code>example.com</code> and <code>www.example.com</code>, plus any subdomain
            you link to.
          </li>
          <li>
            <strong>Serve the full chain.</strong> A missing intermediate certificate works in some browsers and fails in others and in most API
            clients.
          </li>
          <li>
            <strong>Check after deploys and migrations.</strong> Moving to a new server or CDN often leaves renewal configured on the old one.
          </li>
          <li>
            <strong>Watch the date from outside.</strong> Renewal jobs fail silently (DNS changes, rate limits, a full disk). An external check that
            warns two weeks ahead turns an outage into a to-do item.
          </li>
        </ul>
        <p>
          You can read the expiry yourself with <code>openssl s_client -connect example.com:443 -servername example.com</code> and look at
          &ldquo;NotAfter&rdquo;. ChangeKite checks the certificate on every scan, warns under 30 days and treats under 14 days as critical; with
          monitoring it emails you once when that happens. See <Link href="/docs#https">the HTTPS check</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "robots-txt-blocking-search-engines",
    title: "Is robots.txt blocking your whole site?",
    description: "How one line in robots.txt can stop search engines crawling every page, how to check, and the difference between robots.txt and noindex.",
    updated: "2026-11-11",
    steps: [
      { name: "Open your robots.txt", text: "Visit https://your-domain/robots.txt in a browser and read the groups that apply to User-agent: * and to the crawlers you care about." },
      { name: "Look for a site-wide Disallow", text: "A line “Disallow: /” in the group for User-agent: * blocks every compliant crawler from every page." },
      { name: "Remove or narrow the rule", text: "Delete the line, or replace it with the specific paths you really want to keep crawlers out of (for example /admin/)." },
      { name: "Confirm with the search engine", text: "In Google Search Console, check the robots.txt report and use URL Inspection on an important page." },
    ],
    body: (
      <>
        <p>
          <code>robots.txt</code> tells crawlers which paths they may fetch. Two lines are enough to shut every search engine out of the whole site:
        </p>
        <pre className="mt-3 overflow-x-auto bg-paper-deep p-3 text-sm">
          <code>{"User-agent: *\nDisallow: /"}</code>
        </pre>
        <p>
          This is usually an accident: a staging site&rsquo;s file deployed to production, a CMS &ldquo;discourage search engines&rdquo; option left on
          after launch, or a migration that copied the wrong file.
        </p>
        <h2>robots.txt is not noindex</h2>
        <p>
          Blocking a URL in robots.txt stops crawling, not indexing. A blocked page can still appear in results (usually without a description) if
          other sites link to it. To keep a page out of search results, let crawlers fetch it and add <code>&lt;meta name=&quot;robots&quot;
          content=&quot;noindex&quot;&gt;</code> or an <code>X-Robots-Tag: noindex</code> header; a crawler that cannot fetch the page never sees
          that instruction.
        </p>
        <h2>Other things worth checking</h2>
        <ul>
          <li>Rules match by path prefix: <code>Disallow: /p</code> also blocks <code>/products</code> and <code>/pricing</code>.</li>
          <li>A crawler obeys only the most specific group that names it; a separate <code>User-agent: Googlebot</code> group replaces the <code>*</code> rules for Google.</li>
          <li>A robots.txt that answers 5xx can make crawlers treat the whole site as off-limits until it recovers.</li>
          <li>List your sitemap with a <code>Sitemap:</code> line so crawlers find it.</li>
        </ul>
        <p>
          ChangeKite reads robots.txt on every scan, reports a site-wide block as critical, and with monitoring emails you once when the rule
          appears. See <Link href="/docs#robots">the robots.txt check</Link>.
        </p>
      </>
    ),
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
