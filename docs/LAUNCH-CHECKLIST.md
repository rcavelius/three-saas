# Launch checklist (2026-11-11)

## 1. Ready to launch
- **GridRinse**: running on staging (moving to https://gridrinse-staging.netlify.app when the Netlify project is renamed; password in `.secrets/gridrinse-staging.json` once the local secrets file is renamed to match) with real Postgres, real Stripe test mode, real email, hosted scheduled jobs and the AI help center. Ready for public launch once it has a domain, live Stripe and reviewed legal pages.
- **ChangeKite** and **WebhookTrail**: code complete and tested (CI, Docker, real Postgres); not yet deployed to staging.

## 2. Accounts and services
| Service | Status |
|---|---|
| GitHub (private repo rcavelius/three-saas, CI) | connected |
| Netlify (free team; GridRinse staging + Postgres + scheduled jobs + AI Gateway) | connected |
| Stripe — new "GridRinse" account, test mode | connected (test only) |
| Resend (existing account, new sending-only key) | connected; sending from the shared test sender until a domain is verified |
| Domain registrar | needed (purchase is the owner's) |
| Container host for ChangeKite (long crawls need more than Netlify's 10 s function limit) | needed: Fly.io or Render account (free/low tier) |

## 3. What I can do myself
Deploy ChangeKite/WebhookTrail staging, connect domains once bought (DNS records via the registrar's dashboard while signed in), verify the Resend sending domain, Search Console DNS verification, recreate Stripe products/webhooks in live mode after verification, run all tests and drills, monitor and fix.

## 4. What needs you
- Buy the domains (payment).
- Stripe identity/business verification and bank account before live payments; set `STRIPE_LIVE_MODE_AUTHORIZED=true` only when you decide to go live.
- Sign-ups / sign-ins and one-time codes for any new provider (e.g. Fly.io for ChangeKite).
- Legal review of privacy policy and terms.
- Approve each public (un-password-protected) launch.

## 5. Expected initial monthly cost
- GridRinse alone: about **$0–2/month** (Netlify free plan incl. Postgres credits, Resend free tier, ~$1/month domain) + Stripe fees per sale (~3.9% + 30¢). Netlify's free plan pauses (does not bill) if its credits run out.
- All three products: about **$15–30/month** (ChangeKite on a small always-on container ~$6–12, WebhookTrail on Netlify or a container ~$0–6, three domains ~$3/month, optional AI support capped at $5/month each).

## 6. Product names and planned domains
ChangeKite, GridRinse and WebhookTrail were formerly named SiteProof, DataPolish and HookPilot; the owner renamed them on 2026-11-11 because of trademark and domain conflicts with existing products and domains using those names.

| Product | Planned domain | What it is |
|---|---|---|
| ChangeKite | https://changekite.com | website monitoring and health audits; crawler identifies as `ChangeKiteBot` |
| GridRinse | https://gridrinse.com | browser-only spreadsheet cleanup |
| WebhookTrail | https://webhooktrail.com | webhook capture and inspection |

Confirm each domain is still available at purchase time, and run a USPTO/EUIPO trademark search (or ask a lawyer) before buying.

After the rename, staging needs the Netlify project renamed to `gridrinse-staging`, the local secrets file renamed to `.secrets/gridrinse-staging.json`, and the Stripe test prices re-created under the `gridrinse_*` lookup keys (see [DEPLOYMENT.md](DEPLOYMENT.md)).
