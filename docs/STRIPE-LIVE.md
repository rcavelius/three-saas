# Stripe live mode (all three products)

**Decision 2026-11-17 (owner):** GridRinse, ChangeKite and WebhookTrail all sell as **Media Masters LLC**, the owner's
only LLC, through its existing Stripe account (already activated, payouts set up). Each product's card-statement
name is its domain (`GRIDRINSE.COM`, `CHANGEKITE.COM`, `WEBHOOKTRAIL.COM`, set per product). The account also
carries the owner's other business; the apps ignore events for customers they don't manage, and the revenue
report splits by price lookup key, so the other business never shows up as product revenue.

**2026-11-17: GridRinse is LIVE** on the owner's go-ahead ("turn on live payments"). `WORKER_SECRETS_GRIDRINSE`
holds the restricted live key, the live webhook secret and `STRIPE_LIVE_MODE_AUTHORIZED=true`; the test-mode values
are kept in `.secrets/cloudflare-gridrinse.testmode.json`. To go back to test mode, upload that file's uppercase keys
as `WORKER_SECRETS_GRIDRINSE` (no `STRIPE_LIVE_MODE_AUTHORIZED`) and redeploy.

**2026-11-23: ChangeKite and WebhookTrail are LIVE too** (owner: "all the sites making money"). Live products with
the product statement descriptors `CHANGEKITE.COM` / `WEBHOOKTRAIL.COM` and tax code `txcd_10103000` (same as
GridRinse): `changekite_solo` $19, `changekite_agency` $79, `webhooktrail_developer` $9, `webhooktrail_pro` $29
(prices found by lookup key `<app>_<plan>_monthly`), one billing portal per product (metadata.app), and live webhook
endpoints `https://changekite.com/api/billing/webhook` (we_1UeqgP1o4f6ICgX7RoBaVyhn) and
`https://webhooktrail.com/api/billing/webhook` (we_1UeqgQ1o4f6ICgX7lLDnV2Oa) with the 9 events. Their
`WORKER_SECRETS_<APP>` hold the same restricted live key, their own webhook secret and
`STRIPE_LIVE_MODE_AUTHORIZED=true`, and no `STAGING_PASSWORD` (public). The test-mode values are kept in
`.secrets/cloudflare-<app>.testmode.json`. Checkout shows the product name (`branding_settings`) and adds Stripe Tax
(`STRIPE_AUTOMATIC_TAX=1`); terms and privacy are published (`LEGAL_APPROVED=1`, effective 2026-11-23).

**Customer-facing names (owner decision 2026-11-17):** the account's public business name changed from "Travel
Snackbox" to **Media Masters**, and the account statement descriptor from TRAVEL SNACKBOX to **MEDIA MASTERS** (Stripe
requires it to match the public name; the snack-box charges now show MEDIA MASTERS unless that shop sets its own).
GridRinse Checkout shows "GridRinse" (`branding_settings`), subscription charges show GRIDRINSE.COM (product
statement descriptor), the billing portal and Stripe receipts show Media Masters.

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
2. **Legal pages** (all three products): company details set 2026-11-17 in the wrangler vars (Media Masters LLC,
   37837 Fenwick Circle, Selbyville, DE 19975; Delaware law; matches the Stripe account). **GridRinse terms and
   privacy approved by the owner 2026-11-17** and published (`LEGAL_APPROVED=1`, effective 2026-11-17).
   ChangeKite and WebhookTrail texts completed and published 2026-11-23 (`LEGAL_APPROVED=1`).
3. **Done 2026-11-17 (owner approved Stripe Tax):** tax monitoring set up (head office Delaware; fallback category
   Electronically Supplied Services; GridRinse Pro and Business products = `txcd_10103000` SaaS personal use; USD
   prices exclude tax, so it is added on top). GridRinse checkout sends `automatic_tax` (`STRIPE_AUTOMATIC_TAX=1`),
   requires the billing address and offers a tax ID field; checked with an unpaid live session that was expired at
   once. **No state registrations yet**, so Stripe collects $0 everywhere (Delaware has no sales tax) and only
   monitors thresholds. When Stripe says a threshold is reached, the owner registers in that state and adds the
   registration under Settings → Tax → Registrations; Stripe Tax fees apply only to transactions where tax is
   collected. The snack-box products were not changed.
4. **One real purchase** of GridRinse Pro on your own card, refunded afterwards (explicit approval needed).

## What I do after the key is saved

1. `STRIPE_LIVE_SETUP_APPROVED=yes STRIPE_SETUP_APPS=gridrinse` setup run: live "GridRinse Pro" $9/month and
   "GridRinse Business" $29/month and the GridRinse-only portal. Creating products charges nobody.
2. Live webhook endpoint `https://gridrinse.com/api/billing/webhook` (the 9 events from the setup script).
3. **Done 2026-11-17:** live key, webhook secret and `STRIPE_LIVE_MODE_AUTHORIZED=true` into
   `WORKER_SECRETS_GRIDRINSE`, deploy, verify Checkout (merchant name, statement name), portal and webhook delivery.
4. The refunded real purchase (item 4), then announce.
5. **Done 2026-11-23:** ChangeKite and WebhookTrail followed the same steps (see the top of this file).

## Already verified in test mode
Checkout (card 4242), entitlements, billing portal, upgrade, downgrade, declined renewal with notice, cancel at period
end, cancel to Free, cancellation email, account deletion (GridRinse 16/16; ChangeKite and WebhookTrail 10/10), and
live webhook delivery to all three domains.
