# ChangeKite SEO

Everything below needs the production domain; nothing has been submitted anywhere yet.

## Search Console (owner action)

1. In Google Search Console choose **Add property → Domain** and enter the bare domain.
2. Publish the `TXT` record Google shows (`google-site-verification=…`) at the DNS provider for the apex (`@`).
   Propagation is usually minutes; click **Verify**.
3. **Sitemaps → Add a new sitemap**: `https://<domain>/sitemap.xml`. It lists the home page, pricing, docs, the guides,
   the crawler page, sign-up and the legal pages. Private URLs (reports, dashboard, account, admin, API) are excluded and
   disallowed in `robots.txt`.
4. Optional: Bing Webmaster Tools can import the property from Search Console.
5. After a week, check **Pages** for "Excluded by noindex" (expected only for `/login` and private pages) and
   **Enhancements** for the FAQ and software application structured data.

## What is in place

- `metadataBase` from `APP_URL`; canonical URLs on home, pricing, docs-adjacent pages, guides and sign-up.
- Per-page titles and descriptions; Open Graph defaults in the root layout; `noindex` on reports, account, dashboard,
  login, password and invitation pages (plus `X-Robots-Tag` on `/report/*` and `/api/*`).
- JSON-LD, rendered with the per-request CSP nonce:
  - `SoftwareApplication` with one `Offer` per plan from `CHANGEKITE_CATALOG` (home and pricing),
  - `FAQPage` on pricing (billing, cancellation, refunds handled by a person, retention, safety, privacy),
  - `Article` on every guide and `HowTo` on the step-by-step guides.
- The free tool is the home page itself (a working scanner, not a landing page in front of one).
- No testimonials, logos, customer counts or ratings anywhere: there are none yet.

## Target queries

| Query cluster | Page |
| --- | --- |
| free website checker, website audit tool, broken link checker, check my website for errors | `/` (the tool) |
| website monitoring for broken links, SEO monitoring small business, uptime and broken link alerts | `/pricing`, `/` |
| how to find broken links on my website, fix 404 internal links | `/guides/find-and-fix-broken-links` |
| ssl certificate expired warning, certificate expiry monitoring, 47 day certificates | `/guides/tls-certificate-expiry` |
| robots.txt blocking google, disallow all robots.txt, robots.txt vs noindex | `/guides/robots-txt-blocking-search-engines` |
| what does each SEO check mean (titles, meta descriptions, canonical, alt text) | `/docs` |
| ChangeKiteBot user agent | `/bot` |

## Internal links

- Header: What we check (`/docs`), Guides (`/guides`), Pricing; footer adds the crawler page and legal pages.
- Home → docs (each check), crawler page, pricing.
- Each guide → the matching `/docs#…` anchor, the scanner, pricing and the other guides.
- `/guides` → every guide and `/docs`.
- Pricing → free scan (home), sign-up with `?plan=`.
- Report pages link back to the scanner (anonymous) or the site dashboard (account reports); they are not indexed.

## Rules for new content

Write a guide only when it answers a real question the report raises, keep facts checkable (link the check it relates
to), date it in `src/lib/guides.tsx` (`updated`), and add it to the table above.
