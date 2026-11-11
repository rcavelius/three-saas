import type { CheckId } from "./scanner/types";

export interface CheckDoc {
  id: CheckId;
  title: string;
  why: string;
  how: string[];
  severities: string[];
}

/** Plain-language reference for every check; rendered on /docs and linked from reports. */
export const CHECK_DOCS: CheckDoc[] = [
  {
    id: "https",
    title: "HTTPS & certificate",
    why: "Browsers mark plain-http pages “Not secure”, refuse some features on them, and an expired certificate turns your whole site into a full-page warning. HSTS tells browsers to never try http again, closing the window where someone on public Wi-Fi could tamper with the first request.",
    how: [
      "We open a TLS connection to your server, read the certificate, and check that it is trusted and issued for your exact hostname.",
      "We note the issuer and how many days remain until it expires.",
      "We request http://your-host/ without following redirects and check that it points to https://.",
      "We read the Strict-Transport-Security header on your homepage.",
    ],
    severities: [
      "Critical: no HTTPS, untrusted or mismatched certificate, expired, or expiring within 14 days.",
      "Warning: expiring within 30 days, http:// not redirected, HSTS missing.",
      "Notice: HSTS max-age shorter than six months.",
    ],
  },
  {
    id: "status",
    title: "Page status",
    why: "If the start page errors, nothing else matters. Long redirect chains slow every visit and are easy to fix once you see them.",
    how: [
      "Every page we crawl records its HTTP status, and every redirect hop on the way.",
      "Pages that answer with an error, time out, or fail TLS are listed with the reason.",
    ],
    severities: ["Critical: the start page fails or returns 4xx/5xx.", "Notice: two or more redirects before a page loads."],
  },
  {
    id: "internal-links",
    title: "Internal links",
    why: "A link to a missing page is a dead end for visitors and wastes crawl budget. Links that go through a redirect still work, but each hop costs time.",
    how: [
      "We collect every <a href> on the pages we crawl that points to your own host.",
      "Crawled targets use the status we already saw. Anything we did not crawl (too deep, a PDF, past the page cap) gets a light HEAD request, falling back to GET when a server does not support HEAD.",
      "URLs your robots.txt disallows are never requested.",
    ],
    severities: [
      "Critical: a link target returns 4xx or 5xx.",
      "Warning: a link target times out or cannot be loaded.",
      "Notice: link targets that redirect, or that need a login (401/403).",
    ],
  },
  {
    id: "external-links",
    title: "External links",
    why: "Links to other sites rot quietly: domains expire and pages move. Fixing them keeps your content trustworthy.",
    how: [
      "We check up to 50 unique outbound links per scan, with HEAD first and GET as a fallback.",
      "Many large sites block automated requests with 403 or 429. We report those as “could not verify”, not as broken, because a browser would probably load them.",
      "Links to localhost, private networks, raw internal IPs or unusual ports are never requested; we list them because they cannot work for visitors.",
    ],
    severities: [
      "Warning: 404/410 and other 4xx, server errors, domains that do not resolve, certificate errors.",
      "Notice: could not verify (403, 429, timeouts) and private-network links.",
    ],
  },
  {
    id: "titles",
    title: "Page titles",
    why: "The <title> is the headline of your search result and the label of the browser tab. Missing or duplicated titles make pages hard to tell apart.",
    how: [
      "We read the first <title> in each page (ignoring <title> elements inside inline SVG icons).",
      "Length is counted in characters. Results usually show about 50–60 before cutting off.",
      "Duplicates are compared case-insensitively, and pages marked noindex are left out of the comparison.",
    ],
    severities: [
      "Critical: missing or empty title.",
      "Warning: more than one <title>, or the same title on several pages.",
      "Notice: longer than 60 or shorter than 10 characters.",
    ],
  },
  {
    id: "meta-description",
    title: "Meta descriptions",
    why: "Search engines often use the meta description as the snippet under your title. A good one earns the click; a missing one gets replaced by whatever text the engine picks.",
    how: [
      'We read <meta name="description"> (the name is matched case-insensitively).',
      "We flag missing, empty, very short (< 50) and very long (> 160 characters) descriptions, and descriptions reused across pages.",
    ],
    severities: [
      "Warning: missing, empty, or duplicated across pages.",
      "Notice: too short, too long, or more than one tag.",
    ],
  },
  {
    id: "canonical",
    title: "Canonical URLs",
    why: 'rel="canonical" tells search engines which URL is the real one when the same content is reachable at several addresses. A wrong canonical can quietly remove a page from search results.',
    how: [
      "We read <link rel=\"canonical\"> in <head> and the Link HTTP header. Relative URLs are fine; we resolve them against the page (and any <base href>).",
      "Canonicals pointing to another page are requested without following redirects, so we can see whether the target redirects or errors.",
      "We compare the canonical with the page's robots directives: noindex plus a canonical to another URL sends mixed signals.",
    ],
    severities: [
      "Critical: canonical target returns 4xx/5xx.",
      "Warning: several different canonicals, canonical in <body>, empty/invalid href, different host, http:// on an https page, target redirects, noindex conflict, target unreachable.",
      "Notice: no canonical declared.",
    ],
  },
  {
    id: "images",
    title: "Image alt text",
    why: "Screen-reader users hear alt text instead of seeing the image. Without the attribute, many screen readers read out the file name. Alt text also helps image search.",
    how: [
      "We look at every <img> on crawled pages.",
      'An empty alt="" is correct for decorative images, so we never flag it. Only a missing alt attribute is reported.',
      'Images hidden with aria-hidden="true" are skipped.',
    ],
    severities: ["Warning: one finding per page listing the images without an alt attribute."],
  },
  {
    id: "mixed-content",
    title: "Mixed content",
    why: "An https page that pulls scripts or styles over http is blocked by browsers and can break. Images over http are upgraded or flagged, and forms posting to http send data unencrypted.",
    how: [
      "On https pages we list http:// URLs in script, stylesheet, iframe, object and embed tags (active content), in img, srcset, audio, video and source (passive content), and in form actions.",
    ],
    severities: ["Critical: active content or form actions over http.", "Warning: passive content over http."],
  },
  {
    id: "sitemap",
    title: "XML sitemap",
    why: "A sitemap is the list of pages you want found. It matters most for new sites, large sites and pages with few internal links.",
    how: [
      "We read every Sitemap: line in robots.txt, or try /sitemap.xml and /sitemap_index.xml.",
      "We check that the response is XML with a <urlset> or <sitemapindex> root, that tags are balanced, and that every entry has a <loc>. Gzipped sitemaps are supported.",
      "For a sitemap index we open up to three child sitemaps.",
      "We sample up to five listed URLs and check that they return 200 without redirecting and live on the same host.",
    ],
    severities: [
      "Warning: no sitemap, unparseable, empty, over 50,000 URLs, listed URLs on another host, or sampled URLs that do not return 200.",
    ],
  },
  {
    id: "robots",
    title: "robots.txt",
    why: "robots.txt tells crawlers where they may go. One stray “Disallow: /” left over from a staging site can remove a whole site from search.",
    how: [
      "We fetch /robots.txt and follow the rules for SiteProofBot, or the * group when there is no specific one. Longest match wins and Allow wins ties, as in RFC 9309. * and $ wildcards are supported.",
      "A Crawl-delay for our bot is honoured (up to 5 seconds) by crawling one page at a time.",
    ],
    severities: [
      "Critical: blocks all crawlers from the whole site, or robots.txt returns a server error (Google then stops crawling).",
      "Notice: no robots.txt, no Sitemap: line, or SiteProofBot specifically blocked.",
    ],
  },
  {
    id: "crawl",
    title: "Crawl coverage",
    why: "A free scan has limits. These notes tell you exactly what was and was not looked at, so a clean report is not mistaken for a complete one.",
    how: [
      "Free scans follow links on your start host (and the host it redirects to) up to 25 pages and three clicks deep, with at most three requests at a time and a short pause between them.",
      "The whole scan stops after about 45 seconds; anything not reached is listed as not checked.",
    ],
    severities: ["Notice: page cap reached, time limit reached, URLs skipped because robots.txt disallows them."],
  },
];
