// Technical SEO check of one live product site, for the traffic boss (docs/growth/BOSS.md). Read-only and polite
// (4 requests at a time, no redirects followed, own domain only). Prints a JSON report:
//   - sitemap_non_200:     sitemap URLs that do not answer 200 (redirects count as faults: the sitemap should list final URLs)
//   - broken_links:        internal links found on sitemap pages that answer 4xx/5xx, with up to 5 pages that link to each
//   - missing_from_sitemap: internal pages that answer 200, are indexable, are linked from a sitemap page, but are not in the sitemap
//   - page_faults:         sitemap pages with a missing/duplicate <title>, missing meta description, canonical pointing elsewhere, or noindex
//   node scripts/site-check.mjs [gridrinse|changekite|webhooktrail]     (default gridrinse)
const APPS = ["gridrinse", "changekite", "webhooktrail"];
const app = process.argv[2] ?? "gridrinse";
if (!APPS.includes(app)) {
  console.error(`Unknown app "${app}" (expected one of ${APPS.join(", ")})`);
  process.exit(1);
}
const HOST = `${app}.com`;
const ORIGIN = `https://${HOST}`;
const UA = "Mozilla/5.0 (compatible; site-check/1.0; own-site audit)";
// Never crawl private, per-user or machine routes.
const SKIP = /^\/(api|account|admin|dashboard|billing|login|logout|signup|sign-in|sign-up|auth|reset|verify|report\/|e\/|in\/|r\/|_next)/;

async function get(url, method = "GET") {
  try {
    const res = await fetch(url, { method, redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    const body = method === "GET" && (res.headers.get("content-type") ?? "").includes("text/html") ? await res.text() : (await res.body?.cancel(), "");
    return { status: res.status, location: res.headers.get("location"), body, robots: res.headers.get("x-robots-tag") ?? "" };
  } catch (err) {
    return { status: 0, location: null, body: "", robots: "", error: String(err).slice(0, 120) };
  }
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const norm = (u) => {
  const x = new URL(u, ORIGIN);
  x.hash = "";
  x.search = "";
  return x.pathname.replace(/(.)\/$/, "$1");
};

const sitemapRes = await fetch(`${ORIGIN}/sitemap.xml`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
const sitemapXml = sitemapRes?.status === 200 ? await sitemapRes.text() : "";
const sitemapPaths = [...new Set([...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => norm(m[1].trim())))];

const pages = await pool(sitemapPaths, 4, async (path) => ({ path, ...(await get(ORIGIN + path)) }));

const sitemap_non_200 = pages.filter((p) => p.status !== 200).map((p) => ({ path: p.path, status: p.status, location: p.location ?? undefined }));
const linkedFrom = new Map();
const page_faults = [];
const titles = new Map();
for (const p of pages.filter((x) => x.status === 200)) {
  const html = p.body;
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const desc = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ?? "";
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1] ?? /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(html)?.[1];
  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) || /noindex/i.test(p.robots);
  const faults = [];
  if (!title) faults.push("missing <title>");
  if (!desc) faults.push("missing meta description");
  if (canonical && norm(canonical) !== p.path) faults.push(`canonical points to ${norm(canonical)}`);
  if (noindex) faults.push("noindex on a sitemap page");
  if (title) titles.set(title, [...(titles.get(title) ?? []), p.path]);
  if (faults.length) page_faults.push({ path: p.path, faults });
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#][^"']*)["']/gi)) {
    let u;
    try {
      u = new URL(m[1].replace(/&amp;/g, "&"), ORIGIN + p.path);
    } catch {
      continue;
    }
    if (u.host !== HOST || !/^https?:$/.test(u.protocol)) continue;
    const path = norm(u.href);
    if (SKIP.test(path) || /\.(png|jpe?g|svg|webp|gif|ico|pdf|csv|xlsx|zip|txt|xml|json)$/i.test(path)) continue;
    if (!linkedFrom.has(path)) linkedFrom.set(path, new Set());
    linkedFrom.get(path).add(p.path);
  }
}
for (const [title, paths] of titles) if (paths.length > 1) page_faults.push({ path: paths.join(", "), faults: [`duplicate <title> "${title.slice(0, 80)}"`] });

const inSitemap = new Set(sitemapPaths);
const toCheck = [...linkedFrom.keys()].filter((p) => !inSitemap.has(p));
const checked = await pool(toCheck, 4, async (path) => ({ path, ...(await get(ORIGIN + path)) }));
const broken_links = [];
const missing_from_sitemap = [];
for (const c of checked) {
  const from = [...linkedFrom.get(c.path)].slice(0, 5);
  if (c.status >= 400 || c.status === 0) broken_links.push({ path: c.path, status: c.status, linked_from: from });
  else if (c.status === 200) {
    const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(c.body) || /noindex/i.test(c.robots);
    if (!noindex) missing_from_sitemap.push({ path: c.path, linked_from: from });
  }
}
// Links to sitemap pages that themselves fail are already in sitemap_non_200; list who links to them.
for (const f of sitemap_non_200) if (linkedFrom.has(f.path)) f.linked_from = [...linkedFrom.get(f.path)].slice(0, 5);

const report = {
  site: HOST,
  checked_at: new Date().toISOString(),
  sitemap_status: sitemapRes?.status ?? 0,
  sitemap_urls: sitemapPaths.length,
  internal_links_checked: linkedFrom.size,
  sitemap_non_200,
  broken_links,
  missing_from_sitemap,
  page_faults,
};
console.log(JSON.stringify(report, null, 2));
