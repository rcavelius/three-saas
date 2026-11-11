/**
 * Stripe TEST-MODE lifecycle drill against a deployed app (staging). Drives real Stripe test objects for the
 * customer the app created at checkout, so real signed webhooks reach the app:
 *
 *   npx tsx scripts/stripe-lifecycle-drill.mts <step> <customerEmail> [secretsFile]
 *   steps: subscribe-pro | upgrade-business | cancel-at-period-end | resume | cancel-now | status
 *
 * Reads STRIPE_SECRET_KEY from the secrets JSON (default .secrets/datapolish-staging.json) and refuses
 * anything that is not an sk_test_ key. Uses Stripe's test payment method tokens (pm_card_visa); no card
 * numbers are entered anywhere. Prints only object ids and states, never keys.
 */
import { readFileSync } from "node:fs";
import Stripe from "stripe";

const [step, email, secretsFile = ".secrets/datapolish-staging.json"] = process.argv.slice(2);
const key: string = JSON.parse(readFileSync(secretsFile, "utf8")).STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) throw new Error("Refusing to run: not a Stripe TEST secret key");
if (!step || !email) throw new Error("usage: <step> <customerEmail> [secretsFile]");
const stripe = new Stripe(key);

const customers = await stripe.customers.list({ email, limit: 1 });
const customer = customers.data[0];
if (!customer) throw new Error(`No Stripe customer for ${email} (start a checkout in the app first)`);
const prices = await stripe.prices.list({ lookup_keys: ["datapolish_pro_monthly", "datapolish_business_monthly"], active: true });
const price = (lk: string) => prices.data.find((p) => p.lookup_key === lk)!.id;
const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 5 });
const live = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));

const show = (s: Stripe.Subscription) =>
  console.log(
    JSON.stringify({
      subscription: s.id,
      status: s.status,
      price: s.items.data[0]?.price.lookup_key,
      cancel_at_period_end: s.cancel_at_period_end,
      metadata: s.metadata,
    }),
  );

switch (step) {
  case "subscribe-pro": {
    if (live) throw new Error(`Customer already has ${live.id} (${live.status})`);
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    show(
      await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: price("datapolish_pro_monthly") }],
        metadata: customer.metadata,
      }),
    );
    break;
  }
  case "upgrade-business": {
    if (!live) throw new Error("No live subscription");
    show(
      await stripe.subscriptions.update(live.id, {
        items: [{ id: live.items.data[0]!.id, price: price("datapolish_business_monthly") }],
        proration_behavior: "create_prorations",
      }),
    );
    break;
  }
  case "cancel-at-period-end":
    if (!live) throw new Error("No live subscription");
    show(await stripe.subscriptions.update(live.id, { cancel_at_period_end: true }));
    break;
  case "resume":
    if (!live) throw new Error("No live subscription");
    show(await stripe.subscriptions.update(live.id, { cancel_at_period_end: false }));
    break;
  case "cancel-now":
    if (!live) throw new Error("No live subscription");
    show(await stripe.subscriptions.cancel(live.id));
    break;
  case "status": {
    console.log(JSON.stringify({ customer: customer.id, metadata: customer.metadata }));
    subs.data.forEach(show);
    const endpoints = await stripe.webhookEndpoints.list({ limit: 5 });
    for (const e of endpoints.data) console.log(JSON.stringify({ webhook: e.id, url: e.url, status: e.status }));
    break;
  }
  default:
    throw new Error(`unknown step ${step}`);
}
