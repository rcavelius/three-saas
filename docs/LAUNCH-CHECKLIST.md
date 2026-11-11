# Launch checklist (2026-11-11)

## 1. Ready to launch
- **DataPolish**: running on staging (https://datapolish-staging.netlify.app, password in `.secrets/datapolish-staging.json`) with real Postgres, real Stripe test mode, real email, hosted scheduled jobs and the AI help center. Ready for public launch once it has a domain, live Stripe and reviewed legal pages.
- **SiteProof** and **HookPilot**: code complete and tested (CI, Docker, real Postgres); not yet deployed to staging.

## 2. Accounts and services
| Service | Status |
|---|---|
| GitHub (private repo rcavelius/three-saas, CI) | connected |
| Netlify (free team; DataPolish staging + Postgres + scheduled jobs + AI Gateway) | connected |
| Stripe — new "DataPolish" account, test mode | connected (test only) |
| Resend (existing account, new sending-only key) | connected; sending from the shared test sender until a domain is verified |
| Domain registrar | needed (purchase is the owner's) |
| Container host for SiteProof (long crawls need more than Netlify's 10 s function limit) | needed: Fly.io or Render account (free/low tier) |

## 3. What I can do myself
Deploy SiteProof/HookPilot staging, connect domains once bought (DNS records via the registrar's dashboard while signed in), verify the Resend sending domain, Search Console DNS verification, recreate Stripe products/webhooks in live mode after verification, run all tests and drills, monitor and fix.

## 4. What needs you
- Buy the domains (payment).
- Stripe identity/business verification and bank account before live payments; set `STRIPE_LIVE_MODE_AUTHORIZED=true` only when you decide to go live.
- Sign-ups / sign-ins and one-time codes for any new provider (e.g. Fly.io for SiteProof).
- Legal review of privacy policy and terms.
- Approve each public (un-password-protected) launch.

## 5. Expected initial monthly cost
- DataPolish alone: about **$0–2/month** (Netlify free plan incl. Postgres credits, Resend free tier, ~$1/month domain) + Stripe fees per sale (~3.9% + 30¢). Netlify's free plan pauses (does not bill) if its credits run out.
- All three products: about **$15–30/month** (SiteProof on a small always-on container ~$6–12, HookPilot on Netlify or a container ~$0–6, three domains ~$3/month, optional AI support capped at $5/month each).

## 6. Recommended names and domains (availability checked by registry lookup today; web search for conflicts, not a legal trademark search)
| Product | Recommendation | Why |
|---|---|---|
| DataPolish | keep the name; **datapolish.io** (available) or getdatapolish.com (available) | datapolish.com is registered; only a 2024 university project uses the name |
| SiteProof | rename to **SiteGlint** — siteglint.io / siteglint.app (available) | siteproof.io is an existing "SiteProof" site and siteproof.com is listed for sale; no conflicting SiteGlint product found |
| HookPilot | rename to **WebhookTrail** — webhooktrail.com (available) | an existing HookPilot webhook product exists (direct conflict); no WebhookTrail product found |
Run a USPTO/EUIPO trademark search (or ask a lawyer) before buying.
