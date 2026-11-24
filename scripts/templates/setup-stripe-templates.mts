/**
 * Creates the Stripe products and one-time prices for the GridRinse spreadsheet templates (and the bundle).
 * Idempotent: product id "gridrinse_template_<slug>" (dashes become underscores), price found by lookup key; a price whose
 * amount differs from the catalog gets a new price that takes over the lookup key, the old one is deactivated.
 * Never charges anyone. Live keys need STRIPE_LIVE_SETUP_APPROVED=yes.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/templates/setup-stripe-templates.mts
 *
 * A template added later sells even before this runs (Checkout then creates the price inline from the catalog amount);
 * running it afterwards gives the template its own reusable price and product.
 */
import Stripe from "stripe";
import { TEMPLATE_PRODUCTS } from "../../apps/gridrinse/src/content/templates.ts";

/** Stripe Tax: general electronically supplied services (same default as packages/billing for inline prices). */
const TAX_CODE = "txcd_10000000";

async function main() {
  const key = process.env.STRIPE_TEST_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY ?? "";
  const live = /^(sk|rk)_live_/.test(key);
  if (!key) throw new Error("Set STRIPE_SECRET_KEY (or STRIPE_TEST_SECRET_KEY)");
  if (live && process.env.STRIPE_LIVE_SETUP_APPROVED !== "yes") throw new Error("Refusing a LIVE key without STRIPE_LIVE_SETUP_APPROVED=yes");
  if (!live && !/^(sk|rk)_test_/.test(key)) throw new Error("Unrecognised Stripe key");
  console.log(`${live ? "LIVE" : "TEST"} mode: ${TEMPLATE_PRODUCTS.length} template products (no charges)`);
  const stripe = new Stripe(key, { maxNetworkRetries: 2 });

  for (const p of TEMPLATE_PRODUCTS) {
    const productId = p.stripeLookupKey; // gridrinse_template_<slug>
    const metadata = { app: "gridrinse", kind: "product", productId: p.id };
    let product: Stripe.Product;
    try {
      product = await stripe.products.retrieve(productId);
      if (!product.active || product.name !== p.name || product.tax_code !== TAX_CODE) {
        product = await stripe.products.update(productId, { active: true, name: p.name, tax_code: TAX_CODE, metadata });
      }
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e;
      product = await stripe.products.create({ id: productId, name: p.name, tax_code: TAX_CODE, metadata });
      console.log(`created product ${productId}`);
    }
    const existing = await stripe.prices.list({ lookup_keys: [p.stripeLookupKey], active: true, limit: 10 });
    const match = existing.data.find(
      (x) => x.unit_amount === p.priceCents && x.currency === "usd" && x.type === "one_time" && (typeof x.product === "string" ? x.product : x.product.id) === product.id,
    );
    if (match) {
      console.log(`ok      ${p.stripeLookupKey} -> ${match.id} (${(p.priceCents / 100).toFixed(2)} USD)`);
      continue;
    }
    const created = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: p.priceCents,
      tax_behavior: "exclusive",
      lookup_key: p.stripeLookupKey,
      transfer_lookup_key: true,
      metadata,
    });
    for (const old of existing.data) await stripe.prices.update(old.id, { active: false });
    console.log(`created ${p.stripeLookupKey} -> ${created.id} (${(p.priceCents / 100).toFixed(2)} USD)`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
