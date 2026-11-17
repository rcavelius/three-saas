# Switching Stripe to live (prepared, NOT enabled)

**Decision 2026-11-17 (owner):** GridRinse, ChangeKite and WebhookTrail all sell as **Media Masters LLC**, the owner's
only LLC, through its existing Stripe account (already activated, payouts set up). Each product's card-statement
name is its domain (`GRIDRINSE.COM`, `CHANGEKITE.COM`, `WEBHOOKTRAIL.COM`, set per product). The account also
carries the owner's other business; the apps ignore events for customers they don't manage, and the revenue
report splits by price lookup key, so the other business never shows up as product revenue.

Live checkout stays off until every owner item below is done and the owner gives the final go-ahead.

## Owner items

1. **Done 2026-11-17:** restricted key `products-billing` (rk_live_…wGyt) saved and checked read-only: all 10 permissions
   work, balance and payouts are denied. The old full-access `gridrinse` key (sk_live_…K4z6) was expired the same day.
   **Restricted live key** (Stripe → Media Masters LLC → Developers → API keys → Create restricted key), name
   `products-billing`, with:
   - **Write:** Products, Prices, Customers, Checkout Sessions, Customer portal, Subscriptions, Webhook Endpoints
   - **Read:** Events, Invoices, Charges, Refunds
   - Everything else: None.
   Save it with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\save-stripe-live-key.ps1`
   (hidden input, writes git-ignored `.secrets/stripe-live.json`). Never paste it into chat.
2. **Legal pages** (all three products): `LEGAL_ENTITY` = Media Masters LLC; send the business address and the state
   the LLC is registered in (governing law), and approve the terms (14-day refund rule, cancel at period end) and
   privacy policy. Then `LEGAL_APPROVED=1` publishes them.
3. **Sales tax**: decide whether to enable Stripe Tax (paid per transaction, needs approval) or handle it another way.
4. **One real purchase** of GridRinse Pro on your own card, refunded afterwards (explicit approval needed).

## What I do after the key is saved

1. `STRIPE_LIVE_SETUP_APPROVED=yes STRIPE_SETUP_APPS=gridrinse` setup run: live "GridRinse Pro" $9/month and
   "GridRinse Business" $29/month and the GridRinse-only portal. Creating products charges nobody.
2. Live webhook endpoint `https://gridrinse.com/api/billing/webhook` (the 9 events from the setup script).
3. After the legal approval only: live key, webhook secret and `STRIPE_LIVE_MODE_AUTHORIZED=true` into
   `WORKER_SECRETS_GRIDRINSE`, deploy, verify Checkout (merchant name, statement name), portal and webhook delivery.
4. The refunded real purchase (item 4), then announce.
5. ChangeKite and WebhookTrail follow the same steps when they go public.

## Already verified in test mode
Checkout (card 4242), entitlements, billing portal, upgrade, downgrade, declined renewal with notice, cancel at period
end, cancel to Free, cancellation email, account deletion (GridRinse 16/16; ChangeKite and WebhookTrail 10/10), and
live webhook delivery to all three domains.
