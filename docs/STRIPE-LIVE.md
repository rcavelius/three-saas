# GridRinse — switching Stripe to live (prepared, NOT enabled)

Live checkout stays off until every owner item below is done and the owner gives the final go-ahead. Nothing here charges anyone until a customer pays.

## Owner items (need your identity, legal approval or decision)

1. **Stripe account activation** (Stripe Dashboard → Activate payments): legal business type and name, EIN/tax ID, business address, representative's personal details, bank account for payouts. Only you can enter these.
2. **Customer-facing name** (Stripe → Settings → Business → Public details):
   - Public business name: e.g. `GridRinse` (or your company name if you prefer customers to see it).
   - Statement descriptor (what appears on card statements, 5–22 characters): e.g. `GRIDRINSE.COM`. Today it is `MEDIA MASTERS LLC`.
   - Support email `support@gridrinse.com` (working: forwards to your Gmail), support URL `https://gridrinse.com/support`, website `https://gridrinse.com`.
   - Branding (Stripe → Settings → Branding): icon/logo and accent colour so Checkout and invoices look like GridRinse. The account display name is currently "DataPolish" — rename it to GridRinse.
3. **Legal pages** — send me, or set yourself as Worker vars in `deploy/cloudflare/wrangler.gridrinse.jsonc`:
   - `LEGAL_ENTITY` — the company that sells the subscription (as registered).
   - `LEGAL_ADDRESS` — business address shown on the terms/privacy pages.
   - `LEGAL_JURISDICTION` — governing law, e.g. "the State of Delaware, USA".
   - `LEGAL_EFFECTIVE` — date the approved text takes effect.
   - Your approval of the terms (incl. 14-day refund rule, cancel at period end), privacy policy, and whether EU visitors need a consent banner for the anonymous analytics id. Then `LEGAL_APPROVED=1` publishes the pages (draft banner and noindex disappear automatically).
4. **Sales tax / VAT**: decide whether to enable Stripe Tax (it has a per-transaction fee — a paid service, needs your approval) or handle tax another way. Ask your accountant.

## What I do after your go-ahead (about 30 minutes)

1. You create a **restricted live key** in Stripe (Developers → API keys → Create restricted key) with write access to Products, Prices, Customers, Checkout Sessions, Billing Portal, Subscriptions, Invoices, Webhook Endpoints, and read access to Events — and paste it into the secure prompt I give you (never into chat).
2. `STRIPE_LIVE_SETUP_APPROVED=yes npx tsx packages/billing/scripts/setup-stripe-test.ts` with `STRIPE_SETUP_APPS=gridrinse`: live products "GridRinse Pro" $9/month and "GridRinse Business" $29/month, and the GridRinse-only customer portal.
3. Live webhook endpoint `https://gridrinse.com/api/billing/webhook` (same 9 events as test mode); its signing secret goes into `WORKER_SECRETS_GRIDRINSE`, together with the live key and `STRIPE_LIVE_MODE_AUTHORIZED=true` (the app refuses live keys without it).
4. Deploy, then verify: `/api/health`, a live Checkout page opens with the right merchant name, the portal opens with GridRinse plans only, `scripts/stripe-webhook-delivery-check.mts`-style delivery check using events from step 5.
5. **One real purchase** of Pro by you (your own card), then cancel and refund it from the Stripe Dashboard — proves charge, webhook, entitlement, portal, cancellation and refund end to end. Needs your explicit approval because it is a real charge (refunded).
6. Revenue dashboard switches to live numbers automatically (it labels Stripe mode).

## Already verified in test mode
Checkout (card 4242), Pro entitlement, billing portal, upgrade, downgrade, declined renewal with customer notice and email, cancel at period end, cancel to Free, cancellation email, account deletion (16/16), and live webhook delivery to gridrinse.com.
