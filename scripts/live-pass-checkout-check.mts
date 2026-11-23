/**
 * Proves the one-time pass checkout works on the live sites WITHOUT paying: for each app it asks the public
 * /api/billing/pass/checkout route for a Checkout Session, checks the session in Stripe (payment mode, price,
 * metadata, claim URL), then EXPIRES it so it can never be paid.
 *
 *   npx tsx scripts/live-pass-checkout-check.mts        (key from .secrets/stripe-live.json or STRIPE_SECRET_KEY)
 */
import { existsSync, readFileSync } from "node:fs";
import Stripe from "stripe";
import { ALL_CATALOGS } from "../packages/billing/src/catalogs";

const DOMAINS: Record<string, string> = { gridrinse: "gridrinse.com", changekite: "changekite.com", webhooktrail: "webhooktrail.com" };
const key =
  process.env.STRIPE_SECRET_KEY ??
  (existsSync(".secrets/stripe-live.json") ? JSON.parse(readFileSync(".secrets/stripe-live.json", "utf8")).STRIPE_LIVE_KEY : "");
if (!key) throw new Error("no Stripe key");
const stripe = new Stripe(key);

let failed = false;
for (const catalog of ALL_CATALOGS) {
  for (const pass of catalog.passes ?? []) {
    const origin = `https://${DOMAINS[catalog.app]}`;
    const res = await fetch(`${origin}/api/billing/pass/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, "user-agent": "pass-checkout-check" },
      body: JSON.stringify({ passId: pass.id, returnPath: "/pricing" }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    const id = body.url?.match(/cs_(live|test)_[A-Za-z0-9]+/)?.[0];
    if (res.status !== 200 || !id) {
      failed = true;
      console.log(`FAIL ${catalog.app} ${pass.id}: HTTP ${res.status} ${body.error ?? ""}`);
      continue;
    }
    const s = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items"] });
    const li = s.line_items?.data[0];
    const checks: [string, boolean][] = [
      ["live", s.livemode],
      ["payment mode", s.mode === "payment"],
      ["open", s.status === "open"],
      ["unpaid", s.payment_status === "unpaid"],
      [`price ${pass.stripeLookupKey}`, li?.price?.lookup_key === pass.stripeLookupKey && li?.price?.unit_amount === pass.priceCents],
      ["metadata", s.metadata?.app === catalog.app && s.metadata?.kind === "pass" && s.metadata?.passId === pass.id],
      ["claim url", (s.success_url ?? "").startsWith(`${origin}/api/billing/pass/claim?session_id=`)],
    ];
    const expired = await stripe.checkout.sessions.expire(id);
    checks.push(["expired", expired.status === "expired"]);
    const bad = checks.filter(([, ok]) => !ok).map(([n]) => n);
    if (bad.length) failed = true;
    console.log(
      `${bad.length ? "FAIL" : "ok  "} ${catalog.app} ${pass.id} $${(pass.priceCents / 100).toFixed(2)} session ${id.slice(0, 14)}… ` +
        (bad.length ? `failed: ${bad.join(", ")}` : `(${checks.map(([n]) => n).join(", ")})`),
    );
  }
}
process.exit(failed ? 1 : 0);
