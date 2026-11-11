/**
 * Creates the Stripe products and monthly prices for every catalog in a Stripe TEST account.
 * Idempotent: products use fixed ids ("<app>_<plan>"), prices are found by lookup key; a price
 * whose amount no longer matches the catalog is replaced by a new price that takes over the
 * lookup key (transfer_lookup_key), the old one is deactivated. Refuses live keys.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx packages/billing/scripts/setup-stripe-test.ts
 */
import Stripe from "stripe";
import { ALL_CATALOGS } from "../src/catalogs";
import { isLiveKey } from "../src/gateway";
import { STRIPE_WEBHOOK_EVENTS } from "../src/index";

async function main() {
  const key = process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Set STRIPE_SECRET_KEY (or STRIPE_TEST_SECRET_KEY) to a sk_test_ key");
  if (isLiveKey(key) || !/^(sk|rk)_test_/.test(key)) {
    throw new Error("Refusing: this script only runs against a Stripe TEST account (sk_test_/rk_test_ key)");
  }
  const stripe = new Stripe(key, { maxNetworkRetries: 2 });

  // STRIPE_SETUP_APPS=datapolish (comma-separated) limits the run to one product's Stripe account.
  const only = (process.env.STRIPE_SETUP_APPS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const catalogs = only.length ? ALL_CATALOGS.filter((c) => only.includes(c.app)) : ALL_CATALOGS;
  if (only.length && catalogs.length !== only.length) throw new Error(`Unknown app in STRIPE_SETUP_APPS: ${only.join(",")}`);
  for (const catalog of catalogs) {
    for (const plan of catalog.plans) {
      if (!plan.stripeLookupKey) continue;
      const productId = `${catalog.app}_${plan.id}`;
      const productName = `${catalog.app.charAt(0).toUpperCase()}${catalog.app.slice(1)} ${plan.name}`;
      let product: Stripe.Product;
      try {
        product = await stripe.products.retrieve(productId);
        if (!product.active || product.name !== productName) {
          product = await stripe.products.update(productId, { active: true, name: productName });
        }
      } catch (e) {
        if ((e as { statusCode?: number }).statusCode !== 404) throw e;
        product = await stripe.products.create({
          id: productId,
          name: productName,
          metadata: { app: catalog.app, planId: plan.id },
        });
        console.log(`created product ${productId}`);
      }

      const existing = await stripe.prices.list({ lookup_keys: [plan.stripeLookupKey], active: true, limit: 10 });
      const match = existing.data.find(
        (p) =>
          p.unit_amount === plan.priceMonthlyCents &&
          p.currency === "usd" &&
          p.recurring?.interval === "month" &&
          (typeof p.product === "string" ? p.product : p.product.id) === product.id,
      );
      if (match) {
        console.log(`ok      ${plan.stripeLookupKey} -> ${match.id} (${plan.priceMonthlyCents / 100} USD/month)`);
        continue;
      }
      const created = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: plan.priceMonthlyCents,
        recurring: { interval: "month" },
        lookup_key: plan.stripeLookupKey,
        transfer_lookup_key: true,
        metadata: { app: catalog.app, planId: plan.id },
      });
      for (const old of existing.data) await stripe.prices.update(old.id, { active: false });
      console.log(`created ${plan.stripeLookupKey} -> ${created.id} (${plan.priceMonthlyCents / 100} USD/month)`);
    }
  }

  console.log("\nCreate one webhook endpoint PER APP (https://<app-domain>/api/billing/webhook) with these events:");
  for (const e of STRIPE_WEBHOOK_EVENTS) console.log(`  ${e}`);
  console.log("Put each endpoint's signing secret (whsec_...) in that app's STRIPE_WEBHOOK_SECRET.");
  console.log("Billing Portal: enable payment method update, cancel at period end and plan switching between each app's prices.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
