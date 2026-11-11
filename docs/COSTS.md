# Operating cost estimate

**These are planning estimates, not quotes.** Provider prices change; confirm each on the provider's pricing page when the account is opened, then record actual monthly costs in the `cost_entries` table so the owner dashboard reports real numbers.

## Fixed monthly costs at launch (all three products)

| Item | Low | Expected | Notes |
|---|---|---|---|
| App hosting (3 small always-on containers + 1 worker) | $10 | $25–40 | Fly.io / Render small instances. |
| Postgres (3 databases) | $0 | $19–25 | Neon free tier works for launch; paid plan once data or compute grows. |
| Transactional email | $0 | $0–20 | Free tiers cover early volume (low thousands of emails/month). |
| Error tracking / uptime monitoring | $0 | $0 | Free tiers (Sentry developer, Better Stack / UptimeRobot). |
| Domains (3) | ~$3 | ~$4 | ~$10–15 per domain per year, amortised. |
| AI support assistant | $0 | $5–20 | Usage-based; capped with a hard monthly budget alert. |
| **Total** | **~$13** | **~$50–110** | |

## Variable costs

- **Stripe**: percentage + fixed fee per successful charge (standard US card pricing is roughly 2.9% + 30¢; Stripe Billing adds a small percentage of billing volume). At $19/month a subscription nets roughly $18.
- **SiteProof crawling**: bandwidth and CPU scale with scheduled scans. Page caps per plan (enforced in code) bound the worst case.
- **HookPilot storage**: bounded by per-plan request history, payload caps and automatic expiry.
- **DataPolish**: free-tier processing runs in the user's browser and costs nothing server-side.

## Break-even (illustrative)

At ~$80/month fixed cost, break-even is about 5 Solo SiteProof subscriptions, or 7 DataPolish Pro, or 9 HookPilot Developer subscriptions. This excludes the cost of a contracted operator (see OWNER-ACTIONS.md).

## Budget alerts (to configure at signup)

Set spend alerts in every provider that supports them (hosting, Neon, AI provider, email). The app-side monitoring job will also raise an incident when recorded monthly costs exceed a configured budget.
