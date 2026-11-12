/**
 * Proves that real Stripe TEST-mode webhooks reach a deployed app and are processed, without any account
 * in the app: creates a throwaway test customer + subscription (pm_card_visa) and a second customer whose
 * payment fails (pm_card_chargeCustomerFail), waits until Stripe reports every webhook delivered, then reads
 * the app's billing_events rows straight from its production database. Cleans up the Stripe objects.
 *   npx tsx scripts/stripe-webhook-delivery-check.mts .secrets/cloudflare-gridrinse.json
 * Refuses anything but an sk_test_ key. Prints ids and states only.
 */
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import pg from "pg";

const file = process.argv[2] ?? ".secrets/cloudflare-gridrinse.json";
const secrets = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
const key: string = secrets.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) throw new Error("Refusing: not a Stripe TEST key");
const stripe = new Stripe(key);
const stamp = Date.now();
const app = file.match(/cloudflare-([a-z]+)\.json/)?.[1] ?? "gridrinse";
const price = (await stripe.prices.list({ active: true, limit: 100 })).data.find((p) => p.lookup_key?.startsWith(`${app}_`) && p.recurring)?.id;
if (!price) throw new Error(`no ${app}_* test price found`);

async function makeCustomer(label: string, pmToken: string) {
  const c = await stripe.customers.create({ email: `webhook-drill+${label}-${stamp}@example.com`, metadata: { purpose: "webhook-delivery-drill" } });
  const pm = await stripe.paymentMethods.attach(pmToken, { customer: c.id }).catch(async (e) => {
    // pm_card_chargeCustomerFail attaches fine; any attach error is reported and the customer still used.
    console.log(`attach ${label}: ${(e as Error).message}`);
    return null;
  });
  if (pm) await stripe.customers.update(c.id, { invoice_settings: { default_payment_method: pm.id } });
  return c;
}

const ok = await makeCustomer("ok", "pm_card_visa");
const sub = await stripe.subscriptions.create({ customer: ok.id, items: [{ price }] });
console.log(`success path: customer ${ok.id}, subscription ${sub.id} -> ${sub.status}`);
const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
console.log(`cancel at period end -> cancel_at_period_end=${updated.cancel_at_period_end}`);
const canceled = await stripe.subscriptions.cancel(sub.id);
console.log(`cancel now -> ${canceled.status}`);

const bad = await makeCustomer("fail", "pm_card_chargeCustomerFail");
const failSub = await stripe.subscriptions.create({ customer: bad.id, items: [{ price }], payment_behavior: "allow_incomplete" }).catch((e) => {
  console.log(`failing-card subscription create error: ${(e as Error).message}`);
  return null;
});
if (failSub) console.log(`failure path: subscription ${failSub.id} -> ${failSub.status}`);

// Wait until Stripe has delivered every webhook for events of these customers.
const since = Math.floor(stamp / 1000) - 5;
let events: Stripe.Event[] = [];
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const list = await stripe.events.list({ created: { gte: since }, limit: 100 });
  events = list.data.filter((e) => JSON.stringify(e.data.object).includes(String(stamp)) || [ok.id, bad.id].some((id) => JSON.stringify(e.data.object).includes(id)));
  if (events.length && events.every((e) => e.pending_webhooks === 0)) break;
}
console.log(`stripe events for the drill: ${events.length}; still pending delivery: ${events.filter((e) => e.pending_webhooks > 0).length}`);

const db = new pg.Client({ connectionString: secrets.DATABASE_URL });
await db.connect();
const ids = events.map((e) => e.id);
const { rows } = await db.query(`SELECT id, type, outcome, error, processed_at IS NOT NULL AS processed FROM billing_events WHERE id = ANY($1) ORDER BY received_at`, [ids]);
await db.end();
console.log(`received by the app's database: ${rows.length}/${ids.length}`);
for (const r of rows) console.log(`  ${r.type.padEnd(34)} processed=${r.processed} outcome=${r.outcome ?? ""} ${r.error ? "error=" + String(r.error).slice(0, 80) : ""}`);
const typesSeen = new Set(rows.map((r) => r.type));
console.log(`invoice.payment_failed received: ${typesSeen.has("invoice.payment_failed")}`);

// Clean up test objects.
if (failSub && failSub.status !== "canceled") await stripe.subscriptions.cancel(failSub.id).catch(() => undefined);
await stripe.customers.del(ok.id);
await stripe.customers.del(bad.id);
console.log("cleaned up test customers");
