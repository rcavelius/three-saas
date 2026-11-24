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

**2026-11-23: one-time passes (owner: "figure out a way for them to pay").** Each product also sells a one-time pass
through Checkout `mode: payment`, no account needed (catalog `passes` in `packages/billing/src/catalogs.ts`):

| Product | Pass | Price | Lasts | Unlocks | Live price (lookup key) |
|---|---|---|---|---|---|
| GridRinse | 24-hour pass | $5 | 24 h | Pro processing limits, unlimited downloads | `gridrinse_day_pass` |
| ChangeKite | Full-site report | $9 | 7 days | full issue list with fixes, 250-page scans, PDF | `changekite_report_pass` |
| WebhookTrail | 7-day pass | $5 | 7 days | replay, Developer capture limits | `webhooktrail_week_pass` |

Live products `<app>_<pass>_pass` (tax code `txcd_10103000`, tax-exclusive one-time USD prices) were created with the
setup script (`STRIPE_LIVE_SETUP_APPROVED=yes`). One-time card charges show the account prefix plus the
`statement_descriptor_suffix` `<APP>.COM`. The three live webhook endpoints now also send
`checkout.session.async_payment_succeeded` and `charge.refunded` (a full refund revokes the pass). The buyer comes back
through `/api/billing/pass/claim?session_id=…`, which re-checks the session with Stripe, records it in
`billing_passes` (idempotent with the webhook; the pass starts then) and sets an HMAC-signed HttpOnly cookie
`<prefix>_pass`; that URL is also the buyer's unlock link for another device. A pass bought while signed in also counts
for the org. `scripts/live-pass-checkout-check.mts` opens one live Checkout per pass through the public route and
expires it unpaid. The revenue dashboard counts passes from `billing_passes`.

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

## Spreadsheet templates (GridRinse, 2026-11-23)

GridRinse also sells one-time **spreadsheet templates** at https://gridrinse.com/templates (no account needed). Checkout
`mode: payment` with metadata `{ app: "gridrinse", kind: "product", productId }`; the webhook (and the buyer's download
page, whichever comes first) records the order once in `billing_orders` (id = Checkout Session id), access runs 30 days,
a full refund revokes it, and the buyer gets one receipt email with the download link (`onOrderPaid`, outbox mailer).
Live products `gridrinse_template_<slug>` (tax code `txcd_10000000`, tax-exclusive one-time USD prices, lookup key =
product id) were created with `scripts/templates/setup-stripe-templates.mts` (`STRIPE_LIVE_SETUP_APPROVED=yes`):

| Template | Price | Lookup key |
|---|---|---|
| 2027 Budget Planner | $7.99 | `gridrinse_template_annual_budget_planner` |
| Paycheck Budget Planner | $6.99 | `gridrinse_template_paycheck_budget_planner` |
| Debt Payoff Planner | $5.99 | `gridrinse_template_debt_payoff_planner` |
| Savings Challenge Tracker | $4.99 | `gridrinse_template_savings_challenge_tracker` |
| Small Business Bookkeeping 2027 | $12.99 | `gridrinse_template_small_business_bookkeeping` |
| Inventory and Stock Tracker | $9.99 | `gridrinse_template_inventory_tracker` |
| Etsy Seller Profit Tracker | $14.99 | `gridrinse_template_etsy_seller_profit_tracker` |
| Wedding Budget Planner | $14.99 | `gridrinse_template_wedding_budget_planner` |
| Rental Property Manager | $16.99 | `gridrinse_template_rental_property_manager` |
| Short-Term Rental Host Tracker | $14.99 | `gridrinse_template_airbnb_host_tracker` |
| All 10 templates (bundle) | $39.00 | `gridrinse_template_bundle` |

A template added to `apps/gridrinse/src/content/templates.ts` sells even before its price exists (Checkout then creates
the price inline from the catalog amount); re-running the setup script gives it its own product and price.

**Files** are never in this public repository. They live in the private Workers KV namespace
`gridrinse-template-files` (id `e02eb37ac0634cdeac3491e95c3b70bd`, bound to the gridrinse Worker as `TEMPLATE_FILES`;
R2 is not enabled on the account). The download page issues 15-minute links `/api/templates/file?k&n&e&s`
signed with `HMAC(HMAC(SESSION_SECRET, "template-files-v1"), k + LF + n + LF + e)`, and the Worker serves them from KV without
waking the container. Upload with `scripts/templates/upload-template-files.mjs` (needs `CLOUDFLARE_API_TOKEN`).
Checked daily by the live smoke (a live Checkout per template, expired unpaid) and weekly by the test-mode e2e
(card 4242 → download page → files download → one order, one receipt).
