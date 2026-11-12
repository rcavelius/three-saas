# Launch checklist (updated 2026-11-12)

## 1. Where things stand

| Product | URL | Public? | Payments |
|---|---|---|---|
| GridRinse | https://gridrinse.com | **Public since 2026-11-12** (crawlable; private routes protected) | Test mode verified end to end (16/16 local lifecycle + live webhooks). Live checkout **off** until the owner items in [STRIPE-LIVE.md](STRIPE-LIVE.md) are done. |
| ChangeKite | https://changekite.com | Behind the site password | Test mode verified: local checkout lifecycle 10/10, live webhooks |
| WebhookTrail | https://webhooktrail.com | Behind the site password | Test mode verified: local checkout lifecycle 10/10, live webhooks |

- Email: sending works from all three domains (Cloudflare Email Sending). Inbound: `support@gridrinse.com` and `abuse@gridrinse.com` forward to the owner's Gmail (Cloudflare Email Routing, tested 2026-11-12). ChangeKite/WebhookTrail inboxes: same setup still to do before their launch.
- Pricing: GridRinse Pro $9/month (pricing test), Business $29/month. Annual billing not yet supported by the billing package (monthly only).
- Billing portal: one per product, only that product's plans, cancellation at period end.
- Legal pages: drafts (noindex) until the owner supplies `LEGAL_ENTITY`, `LEGAL_ADDRESS`, `LEGAL_JURISDICTION`, approves the text, and `LEGAL_APPROVED=1` is set.

## 2. What needs the owner
See [STRIPE-LIVE.md](STRIPE-LIVE.md) (Stripe activation, public business name and statement descriptor, legal details and approval, tax decision, one refunded real purchase) and [GO-TO-MARKET.md](GO-TO-MARKET.md).

## 3. Running costs
Cloudflare Workers Paid $5/month + container usage (expected ≈ $5–10/month), Neon free, domains $33.51/year (paid), Stripe fees per sale only. Budget alerts at $10/$15/$30/$60. No other paid services.
