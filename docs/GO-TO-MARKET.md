# Go-to-market and first-revenue plan — 2026-11-12

Goal: first real paying customer, GridRinse first. Competitor prices below were checked on 2026-11-11 from the vendors' own pricing pages (sources at the end); keyword volumes could not be verified from public data, so none are quoted.

## A. Exact blockers before the first legitimate customer can pay (GridRinse)

| # | Blocker | Who | Status |
|---|---|---|---|
| 1 | Remove the launch password from gridrinse.com (public visitors + search engines) | **You approve**, I do it | waiting |
| 2 | Legal identity for the policies: legal entity name, business address, governing-law jurisdiction | **You provide** | the pages read them from settings (`LEGAL_ENTITY`, `LEGAL_ADDRESS`, `LEGAL_JURISDICTION`) — no code change needed |
| 3 | Approve the terms/privacy/refund text (ideally with a lawyer); also decide on EU cookie/local-storage consent for the anonymous analytics id | **You approve** | text ready: refund within 14 days on request, cancel any time at period end, service providers listed |
| 4 | Customer-facing billing name: Stripe Checkout currently shows "MEDIA MASTERS LLC" (statement descriptor) and the account is named "DataPolish" | **You decide** in Stripe → Settings → Public details (e.g. business name "GridRinse", statement descriptor "GRIDRINSE.COM"), or keep your LLC as the merchant | waiting |
| 5 | support@ and abuse@ inboxes (currently bounce) | **You approve** a DNS change; I set up free Cloudflare Email Routing → your Gmail | blocked by the permission system until you say yes |
| 6 | Stripe live activation: identity, business details, bank account | **You** (Stripe dashboard, your personal data) | not started |
| 7 | Live keys, live webhook endpoint, live products/prices and portal | I do it in one step **after your final approval** | scripted (same scripts as test mode) |
| 8 | One real end-to-end live purchase check (a $1 test-price or your own card, refunded) | **You approve** the charge | — |

Done today without you: product-specific billing portals (each product offers only its own plans), refund/cancellation policy text, service-provider disclosure, revenue dashboard, Stripe test products/webhooks for all three products, live webhook delivery verified on all three domains.

## B. Pricing recommendations (need your approval before changing)

| Product | Today | Market (entry paid tier) | Recommendation |
|---|---|---|---|
| GridRinse | Pro $12, Business $29 | CSV Clean Pro $10; neatcsv from €9; Mammoth Starter $39 (annual); OpenRefine free | **Pro $9/mo (or $59/yr), Business $29.** Lead the pitch with *saved workflows for recurring exports* (Shopify/Stripe/bank/CRM) — browser-only cleaning alone is now common. Later test a one-off 7-day pass (~$7) for occasional users (needs a small code change). |
| ChangeKite | Solo $19 (3 sites, daily), Agency $79 (20 sites, 6-hourly, PDF) | Oh Dear Solo $17 (2 sites, all features), Studio $109 (25 sites); Dr. Link Check $13 (monthly checks; daily only at $159); Little Warden Agency £59.99 | **Solo $15 (3 sites, daily), Agency $49 (20 sites, white-label PDF).** Daily SEO+link+SSL checks for several sites under $20 is the open gap. |
| WebhookTrail | Developer $9, Pro $29 | webhook.site $9 / $19; Beeceptor $10; ngrok $10; Hookdeck Team from $39 | **Developer $9 (keep), Pro $24** positioned as "replay with retries, under Hookdeck's $39". |

All three: add annual billing (2 months free) once the first monthly customers exist; keep the free tool as the acquisition hook but cap it so recurring use needs a plan (already true: GridRinse 3 files/5 MB, ChangeKite one-off scans 5/hour, WebhookTrail 24-hour anonymous endpoints).

## C. Who pays first, and how to reach the first 10

**GridRinse** — people who clean the *same* export every week or month: bookkeepers, Shopify/e-commerce operators, CRM admins; plus privacy-bound users (HR, finance) who cannot upload files.
- Why pay: saved workflows turn a 20-minute weekly chore into one click; files never leave the browser.
- First 10: answer specific "how do I clean/fix this CSV" questions in r/excel, r/shopify, r/bookkeeping and Shopify Community with the free tool (rules there limit self-promotion — help first, link only when it solves the question); list on AlternativeTo next to OpenRefine/CSV Clean; Product Hunt launch (ask for visits and comments, never upvotes); direct outreach to 20 small bookkeeping firms offering one month free in exchange for honest feedback (not a testimonial unless they volunteer it).
- Trust: live demo with your own file before sign-up, visible privacy proof (no upload), plain pricing, cancel-any-time, named operator and support address.

**ChangeKite** — freelancers and small agencies running WordPress care plans who must show clients monthly proof; site owners who were burned by an expired certificate or a robots.txt that blocked Google.
- First 10: free scan link in r/Wordpress, r/TechSEO and WordPress agency communities (answer "how do I find broken links" threads); "Oh Dear / Dr. Link Check / Little Warden alternative" pages; cold email to 30 local web agencies with a free scan of one of their client sites attached (from the public scanner, respecting robots.txt).
- Trust: the free scan *is* the demo; sample PDF report; transparent crawler identity (ChangeKiteBot) and robots.txt compliance.

**WebhookTrail** — developers integrating Stripe/Shopify/GitHub who need a URL that does not expire after a week (webhook.site's free limit) and small teams who need replay with retries without Hookdeck pricing.
- First 10: Show HN (works without sign-up — fits HN rules); "webhook.site alternative" and "RequestBin alternative" pages (the original RequestBin is gone); short guides "test Stripe webhooks without a tunnel" posted to dev.to; answer Stack Overflow questions where a capture URL is the answer.
- Trust: no-sign-up endpoint in one click, secret masking, clear retention and limits table, public docs.

## D. SEO — transactional pages first (no fake reviews, no doorway pages)

Build one genuinely useful page per real buyer question, each with the free tool embedded or one click away:
- GridRinse: "Clean a Shopify export CSV", "Clean a Stripe payout CSV", "Fix mixed DD/MM and MM/DD dates in a spreadsheet", "OpenRefine alternative that needs no install", "Remove duplicate rows from a CSV without uploading it", "GridRinse pricing".
- ChangeKite: "Broken link monitoring with email alerts", "SSL certificate expiry monitoring", "robots.txt blocking check", "Website health report for clients (PDF)", "Oh Dear alternative", "Dr. Link Check alternative".
- WebhookTrail: "webhook.site alternative", "RequestBin alternative", "Replay a webhook to staging", "Inspect Stripe webhooks", "Debug Shopify webhooks".
- Comparisons state verifiable facts with the date checked and a link to the competitor's pricing page; where a competitor is better, say so.
- After going public: Google Search Console + Bing Webmaster Tools (DNS verification — needs your approval), submit sitemaps.

## E. Measuring revenue

- **Dashboard:** GitHub → Actions → "Revenue funnel report" (daily 13:00 UTC, or Run workflow). Per product: visitors, qualified visitors, pricing views, sign-ups, checkout starts, new and active paid subscriptions, MRR, cancellations, refunds, spend, CAC, visitor → checkout rate. Local: `npx tsx scripts/revenue-dashboard.mts 30`.
- **Spend for CAC:** add a line to `docs/marketing-spend.json` for every paid experiment (date, product, USD, channel).

## F. First controlled experiment (after live payments work)

GridRinse, 14 days, **$50 total cap** (needs your approval — no ad account exists today):
- Channel: Reddit or Google Search ads on 3–5 exact transactional queries ("clean shopify csv export", "fix date format csv", "remove duplicates csv online").
- Landing: the matching transactional page with the tool embedded; Pro at $9 vs $12 split by visitor id (needs a small code change) or sequential weeks.
- Success: ≥1 paid subscription and a visitor → checkout rate ≥ 1%; stop early if CAC exceeds 3 months of the plan price.
- Free alternative first: the community/outreach plan in C, measured the same way.

## G. Execution order

1. **You** (30 minutes): items A2, A4, A6 and yes/no on A1, A5, B pricing. Everything else waits only on these.
2. **Me, immediately after:** set legal vars + publish policies, email routing, pricing change + Stripe prices, go-public on gridrinse.com, Search Console prep, live Stripe setup (keys you paste into the Stripe-provided flow or GitHub secret prompt), one live purchase check → **GridRinse open for paying customers.**
3. **Me, in parallel (no input needed):** GridRinse transactional pages (5–6), ChangeKite + WebhookTrail local end-to-end checkout runs (same 16-step lifecycle), their legal pages on the same pattern, comparison pages.
4. **Then:** ChangeKite and WebhookTrail go public and paid on the same checklist; start the outreach plan; run the $50 experiment only after the first organic purchase or 2 weeks of outreach.

## Sources (checked 2026-11-11)
csvclean.app · alternativeto.net/software/neatcsv · mammoth.io/pricing · openrefine.org · ohdear.app/pricing · drlinkcheck.com/pricing · littlewarden.com/pricing · uptimerobot.com/pricing · webhook.site/pricing · beeceptor.com/pricing · hookdeck.com/pricing · ngrok.com/pricing · hookdeck.com/webhooks/platforms/requestbin-alternatives · news.ycombinator.com/showhn.html · producthunt.com/launch/sharing-your-launch
