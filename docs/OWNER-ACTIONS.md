# Owner and operator actions

The products automate routine work: signup, verification, billing, plan changes, dunning emails, scans and alerts, cleanup, retention, reconciliation, health checks and owner alerts. They are **not** able to run permanently with zero human oversight. This file lists what genuinely needs a person.

## Exact owner actions, in order (each one is the owner's decision; nothing here has been done)

| # | Action | Unblocks | Time |
|---|---|---|---|
| 1 | Choose and buy three domains (one per product). | Everything public | 30 min |
| 2 | Create a Stripe account, complete business verification (identity, bank, tax settings). Give me a **test-mode** secret key (`sk_test_…`) as an environment variable, not in chat. | Real-Stripe test lifecycle gate | 1–2 h + Stripe review |
| 3 | Create accounts with payment methods: Fly.io (hosting), Neon (Postgres), Resend (email). Turn on spend alerts in each (suggested: Fly $50, Neon $30, Resend at plan limit). | Deployment, real-Postgres and email gates | 1 h |
| 4 | Have a lawyer review `/privacy` and `/terms` of all three apps (drafts in each app). | Public launch | external |
| 5 | Decide the legal entity and sales-tax handling (e.g. Stripe Tax). | Live billing | external |
| 6 | Authorize the first deployment to the test environment (staging subdomains). I then deploy, run the gates marked NOT TESTED in RELEASE-REPORT.md, and report. | Release gates | — |
| 7 | Add DNS records I provide: Fly certificates, Resend SPF/DKIM/DMARC, Google Search Console TXT. | Email deliverability, SEO | 30 min |
| 8 | Grant yourself the dashboard role once signed up: `UPDATE auth_user SET role = 'owner' WHERE email = '<you>';` (exact command per app in each README). | /admin dashboards | 5 min |
| 9 | Authorize go-live with live billing: set `STRIPE_LIVE_MODE_AUTHORIZED=true` and live keys yourself. The code refuses live keys without it. | Taking real money | 15 min |
| 10 | Choose a contracted operator (or yourself) for the exceptions below, and set `OWNER_ALERT_EMAIL`. | Incident handling | — |

## Exceptions that need a person (a few hours per month)

The apps route these to `/admin` (open incidents, dead-letter jobs, billing events) and to the owner alert email (critical incidents immediately, warnings in one daily digest):

- Refunds outside policy, chargebacks and disputes (the AI/automation never grants refunds or makes legal commitments).
- Support requests the help pages don't answer; account-ownership disputes; data access/deletion requests that fail self-service.
- Abuse: HookPilot endpoints used for spam or phishing, SiteProof used against sites that object (opt-out requests via the `/bot` page), law-enforcement or legal requests.
- Critical incidents: outages, repeated dead-letter jobs, webhook backlog, budget overruns, backup verification failures.
- Reviewing any drafted SEO content before it is published.

Operators acknowledge an incident in `/admin` to stop repeat alerts; escalation to a higher severity alerts again.

## Development blockers

None for development. The remaining release gates (real Stripe test mode, real email, real Postgres, Docker image, external uptime) need actions 2, 3 and 6.
