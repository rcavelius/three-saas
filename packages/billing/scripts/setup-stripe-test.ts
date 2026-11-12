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

/** Customer-facing product names on Stripe Checkout, invoices and the portal. */
const BRAND_NAMES: Record<string, string> = { changekite: "ChangeKite", gridrinse: "GridRinse", webhooktrail: "WebhookTrail" };
const APP_DOMAINS: Record<string, string> = { changekite: "changekite.com", gridrinse: "gridrinse.com", webhooktrail: "webhooktrail.com" };

/**
 * One customer portal per product: only that product's plans can be switched to; cancellation at period end
 * with a reason; card, address and invoice management. Billing finds it at runtime by metadata.app.
 */
async function setupPortals(stripe: Stripe, catalogs: typeof ALL_CATALOGS) {
  const existing: Stripe.BillingPortal.Configuration[] = [];
  for await (const c of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) existing.push(c);
  for (const catalog of catalogs) {
    const products: { product: string; prices: string[] }[] = [];
    for (const plan of catalog.plans) {
      if (!plan.stripeLookupKey) continue;
      const price = (await stripe.prices.list({ lookup_keys: [plan.stripeLookupKey], active: true, limit: 1 })).data[0];
      if (price) products.push({ product: typeof price.product === "string" ? price.product : price.product.id, prices: [price.id] });
    }
    const domain = APP_DOMAINS[catalog.app];
    const brand = BRAND_NAMES[catalog.app] ?? catalog.app;
    const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] },
      },
      subscription_update: { enabled: products.length > 1, default_allowed_updates: ["price"], products, proration_behavior: "create_prorations" },
    };
    const business_profile = {
      headline: `${brand}: manage your subscription`,
      ...(domain ? { privacy_policy_url: `https://${domain}/privacy`, terms_of_service_url: `https://${domain}/terms` } : {}),
    };
    const default_return_url = domain ? `https://${domain}/account/billing` : undefined;
    const found = existing.find((c) => c.metadata?.app === catalog.app);
    if (found) {
      await stripe.billingPortal.configurations.update(found.id, { business_profile, default_return_url, features });
      console.log(`portal  ${catalog.app} -> ${found.id} (updated, ${products.length} plans)`);
    } else {
      const created = await stripe.billingPortal.configurations.create({ business_profile, default_return_url, features, metadata: { app: catalog.app } });
      console.log(`portal  ${catalog.app} -> ${created.id} (created, ${products.length} plans)`);
    }
  }
}

async function main() {
  const key = process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) throw new Error("Set STRIPE_SECRET_KEY (or STRIPE_TEST_SECRET_KEY) to a sk_test_ key");
  // Live mode only with an explicit owner approval in the environment (STRIPE_LIVE_SETUP_APPROVED=yes):
  // it creates products, prices and portals but never charges anyone.
  const liveApproved = process.env.STRIPE_LIVE_SETUP_APPROVED === "yes";
  if (isLiveKey(key) && !liveApproved) {
    throw new Error("Refusing a LIVE key: set STRIPE_LIVE_SETUP_APPROVED=yes only after the owner approved the live setup");
  }
  if (!isLiveKey(key) && !/^(sk|rk)_test_/.test(key)) throw new Error("Unrecognised Stripe key");
  if (isLiveKey(key)) console.log("LIVE MODE: creating live products, prices and portals (no charges)");
  const stripe = new Stripe(key, { maxNetworkRetries: 2 });

  // STRIPE_SETUP_APPS=gridrinse (comma-separated) limits the run to one product's Stripe account.
  const only = (process.env.STRIPE_SETUP_APPS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const catalogs = only.length ? ALL_CATALOGS.filter((c) => only.includes(c.app)) : ALL_CATALOGS;
  if (only.length && catalogs.length !== only.length) throw new Error(`Unknown app in STRIPE_SETUP_APPS: ${only.join(",")}`);
  for (const catalog of catalogs) {
    for (const plan of catalog.plans) {
      if (!plan.stripeLookupKey) continue;
      const productId = `${catalog.app}_${plan.id}`;
      const productName = `${BRAND_NAMES[catalog.app] ?? catalog.app} ${plan.name}`;
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

  await setupPortals(stripe, catalogs);

  console.log("\nCreate one webhook endpoint PER APP (https://<app-domain>/api/billing/webhook) with these events:");
  for (const e of STRIPE_WEBHOOK_EVENTS) console.log(`  ${e}`);
  console.log("Put each endpoint's signing secret (whsec_...) in that app's STRIPE_WEBHOOK_SECRET.");
  console.log("Billing Portal: enable payment method update, cancel at period end and plan switching between each app's prices.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
