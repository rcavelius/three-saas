# Owner and operator actions

The products are built to automate routine work (signup, billing, scans, cleanup, notifications, first-line support). They are **not** able to run permanently with zero human oversight. This file lists what genuinely needs a person.

## One-time, owner only (blocks public launch)

| # | Action | Why a human | Blocks |
|---|---|---|---|
| 1 | Choose and buy 3 domains | Purchase and registrant identity | Public deployment, email sending, Search Console |
| 2 | Create a Stripe account and complete business verification (KYC), bank account, tax settings | Legal identity and payouts | Live billing (test mode works without it) |
| 3 | Create hosting, database, and email provider accounts with a payment method; set budget alerts | Paid services need the owner's authorization | Deployment |
| 4 | Legal review of the privacy policy and terms drafts in each app | Drafts are not legal advice | Public launch |
| 5 | Decide the legal entity / sole trader setup and sales-tax handling (Stripe Tax or otherwise) | Legal and tax obligations | Live billing |
| 6 | Verify each domain in Google Search Console (DNS TXT record) | Requires domain control | SEO reporting |
| 7 | Approve the first production deployment | Public deployment authorization | Launch |

Credentials are given to the platform as environment variables only; never commit them to the repo.

## Exceptional tasks for a contracted operator (a few hours per month)

These are routed to an operator queue (incidents and escalated support tickets) rather than handled automatically:

- Refunds outside the automatic policy, chargebacks and disputes.
- Support requests the AI assistant could not resolve, account-ownership disputes, data access/deletion requests that fail automated checks.
- Abuse reports (e.g. HookPilot endpoints used for phishing, SiteProof used to scan sites aggressively) and law-enforcement or legal requests.
- Critical incidents: outage longer than the alert threshold, backup verification failure, payment webhook failures, budget alerts.
- Reviewing AI-drafted SEO content before publishing.

The operator console (Phase 4) will give an operator access to these queues without full owner/database access.

## Current blockers for development

None. Everything up to production deployment can be built and tested locally with Stripe test mode and PGlite.
