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
  {
    slug: "not-secure-after-moving-to-https",
    title: "Why a page says \u201cnot secure\u201d after moving to HTTPS",
    description: "The usual cause is mixed content: an https page that still loads images, scripts or forms over http://. How to find each one and what the browser does with it.",
    updated: "2026-11-23",
    steps: [
      { name: "Find the http:// resources", text: "Scan the site with a mixed content checker such as ChangeKite, or open the page source and search for src=\"http:// and href=\"http://." },
      { name: "Switch them to https", text: "Change each URL to https:// (or a relative URL). If the other host does not serve HTTPS, host the file yourself or drop it." },
      { name: "Check forms", text: "Make sure every form action points to an https:// URL, so submitted data is encrypted." },
      { name: "Fix the source", text: "Update templates, theme settings, widgets and database content, not just one page, then scan again." },
    ],
    body: (
      <>
        <p>
          You installed a certificate and the site loads over <code>https://</code>, yet the browser shows a warning or no padlock. The most common
          reason is <strong>mixed content</strong>: the page itself is delivered over HTTPS, but something on it is still requested over plain{" "}
          <code>http://</code>.
        </p>
        <h2>What the browser does</h2>
        <ul>
          <li><strong>Scripts, stylesheets and frames</strong> over http are active content. Browsers block them on https pages, so the page can lose its layout or features.</li>
          <li><strong>Images, audio and video</strong> over http are passive content. Browsers may upgrade or block them and can show the page as not fully secure.</li>
          <li><strong>Forms</strong> whose action is an http:// URL would send what visitors type unencrypted, and browsers can warn about that.</li>
        </ul>
        <h2>Where the http:// links hide</h2>
        <ul>
          <li>Hard-coded absolute URLs in templates, themes and menus from before the move.</li>
          <li>Images and embeds inside older articles, stored in the database with <code>http://</code> addresses.</li>
          <li>Third-party widgets, fonts or scripts added with an http:// address.</li>
          <li><code>srcset</code> lists and <code>&lt;source&gt;</code> tags, which are easy to miss when searching for <code>src=</code>.</li>
        </ul>
        <h2>How to fix it</h2>
        <p>
          Change each address to <code>https://</code>, or to a relative URL such as <code>/images/logo.png</code>. If the other host does not serve
          HTTPS, copy the file to your own server or remove it. Then fix the source (template, theme setting, database content), because fixing
          one page leaves the rest as they were.
        </p>
        <p>
          ChangeKite reads the HTML of every https page it crawls and lists each http:// resource by page, split into active content (critical),
          images and media (warning) and form actions (critical). It does not run JavaScript, so resources that scripts add after load are not
          seen. Try the <Link href="/tools/mixed-content-checker">mixed content checker</Link>. Also confirm that plain http:// requests redirect to
          https with the <Link href="/tools/http-to-https-redirect-checker">HTTP to HTTPS redirect checker</Link>, and see{" "}
          <Link href="/docs#https">the HTTPS check</Link>.
        </p>
      </>
    ),
  },
  {
    slug: "wrong-canonical-tag",
    title: "What a wrong canonical tag does, and how to find it",
    description: "A canonical tag that points at the wrong URL can pull a page out of search results. The common mistakes, what each one tells search engines, and how to fix them.",
    updated: "2026-11-25",
    steps: [
      { name: "List each page's canonical", text: "Scan the site with a canonical tag checker such as ChangeKite, or view the page source and search for rel=\"canonical\"." },
      { name: "Compare it with the page's own address", text: "On a normal page the canonical should be the page's own final https:// URL. Any other value tells search engines to prefer a different page." },
      { name: "Fix the template", text: "Most wrong canonicals come from one template, plugin or setting, so fix the source rather than single pages." },
      { name: "Scan again", text: "Confirm each finding is gone and that no page declares more than one canonical." },
    ],
    body: (
      <>
        <p>
          A canonical tag, <code>&lt;link rel=&quot;canonical&quot; href=&quot;&hellip;&quot;&gt;</code> in the <code>&lt;head&gt;</code>, tells search
          engines which URL is the preferred version of a page. Pointed at the right address it merges duplicates such as tracking-parameter
          URLs. Pointed at the wrong one, it can tell search engines to prefer another page and drop this one.
        </p>
        <h2>Common mistakes</h2>
        <ul>
          <li><strong>Canonical to a page that returns an error.</strong> If the target answers 404 or another 4xx/5xx, the page can fall out of search results.</li>
          <li><strong>Canonical to a URL that redirects.</strong> It should point straight at the final URL.</li>
          <li><strong>Canonical to the http:// version</strong> of an https page, often left over from before an HTTPS move.</li>
          <li><strong>Canonical to another host</strong>, for example a staging site or the www/non-www variant you do not use. That is only right for a deliberate copy.</li>
          <li><strong>Several different canonicals</strong> on one page, usually a theme plus an SEO plugin. With conflicting values search engines may ignore all of them.</li>
          <li><strong>Canonical outside the head</strong>, often caused by an unclosed element, which makes it ignored.</li>
          <li><strong>Empty or invalid href</strong>, which gives search engines nothing to use.</li>
          <li><strong>noindex plus a canonical to another page</strong>: two conflicting signals.</li>
        </ul>
        <h2>How to fix it</h2>
        <p>
          For an ordinary page, the canonical should be that page&rsquo;s own final <code>https://</code> URL. Only point it elsewhere when the page is
          a deliberate duplicate of that other page. Fix the template or plugin that writes the tag, then scan again.
        </p>
        <p>
          ChangeKite reads the canonical on every page it crawls and reports each of the cases above, rating a canonical that returns 4xx/5xx as
          critical and the others as warnings. A missing canonical is only a notice. It reads the HTML as delivered and does not run JavaScript, so a
          canonical added by a script is not seen. Try the <Link href="/tools/canonical-tag-checker">canonical tag checker</Link>, and check the
          related conflict with the{" "}
          <Link href="/tools/noindex-canonical-conflict-checker">noindex and canonical conflict checker</Link>. Then scan your own site below.
        </p>
      </>
    ),
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
