/**
 * Daily LIVE checkout smoke check. NEVER PAYS. For every one-time pass and every paid monthly plan of the three live
 * sites it proves a visitor could pay right now, then EXPIRES every Checkout Session it opened:
 *  - passes: POST the site's own /api/billing/pass/checkout (what the paywall button does), then check the live session
 *    in Stripe (payment mode, open, unpaid, right lookup key and amount, metadata, claim URL) and expire it;
 *  - plans: the site's /api/billing/checkout must refuse anonymous visitors (401; creating accounts on the live
 *    sites is off-limits for automation), the live price behind the lookup key must be active, monthly and the
 *    catalog amount, the pricing page must show it, and a live subscription Checkout for it opens and is expired.
 *
 *   STRIPE_LIVE_KEY_<APP>=sk_live_... npx tsx scripts/checkout-e2e/live-smoke.mts <outFile>
 */
import { writeFileSync } from "node:fs";
import Stripe from "stripe";
import { ALL_CATALOGS } from "../../packages/billing/src/catalogs";

const DOMAINS: Record<string, string> = { gridrinse: "gridrinse.com", changekite: "changekite.com", webhooktrail: "webhooktrail.com" };
const outFile = process.argv[2] ?? "live-smoke.json";
const UA = "checkout-health-smoke (never pays; sessions are expired at once)";

interface Check {
  app: string;
  flow: string;
  ok: boolean;
  failed: string[];
}
const results: Check[] = [];
const usd = (c: number) => `$${(c / 100).toFixed(2).replace(/\.00$/, "")}`;

/** Retries for about two minutes: a deploy swaps the container and answers 503 meanwhile (not a checkout fault). */
async function retry<T>(fn: () => Promise<T>, n = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < n - 1) await new Promise((r) => setTimeout(r, 8000 * (i + 1)));
    }
  }
  throw last;
}

for (const catalog of ALL_CATALOGS) {
  const app = catalog.app;
  const origin = `https://${DOMAINS[app]}`;
  const key = process.env[`STRIPE_LIVE_KEY_${app.toUpperCase()}`] ?? "";
  if (!/^(sk|rk)_live_/.test(key)) {
    results.push({ app, flow: "live key", ok: false, failed: ["no live Stripe key for this app"] });
    continue;
  }
  const stripe = new Stripe(key);
  const pricing = await retry(async () => {
    const r = await fetch(`${origin}/pricing`, { headers: { "user-agent": UA } });
    if (r.status !== 200) throw new Error(`pricing HTTP ${r.status}`);
    // React separates "$" and the number with <!-- --> in server-rendered text.
    return (await r.text()).replace(/<!-- -->/g, "");
  }).catch(() => "");

  for (const pass of catalog.passes ?? []) {
    const flow = `pass ${pass.id} ${usd(pass.priceCents)}`;
    const failed: string[] = [];
    let id: string | undefined;
    try {
      const body = await retry(async () => {
        const res = await fetch(`${origin}/api/billing/pass/checkout`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, "user-agent": UA },
          body: JSON.stringify({ passId: pass.id, returnPath: "/pricing" }),
        });
        const b = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (res.status !== 200 || !b.url) throw new Error(`pass checkout HTTP ${res.status} ${b.error ?? ""}`);
        return b;
      });
      if (!body.url!.startsWith("https://checkout.stripe.com/")) failed.push("checkout url not on checkout.stripe.com");
      id = body.url!.match(/cs_live_[A-Za-z0-9]+/)?.[0];
      if (!id) throw new Error("no live session id in the checkout url");
      const s = await stripe.checkout.sessions.retrieve(id, { expand: ["line_items"] });
      const li = s.line_items?.data[0];
      const checks: [string, boolean][] = [
        ["live", s.livemode],
        ["payment mode", s.mode === "payment"],
        ["open and unpaid", s.status === "open" && s.payment_status === "unpaid"],
        [`price ${pass.stripeLookupKey}`, li?.price?.lookup_key === pass.stripeLookupKey && li?.price?.unit_amount === pass.priceCents],
        [`amount ${usd(pass.priceCents)}`, s.amount_total === pass.priceCents && s.currency === "usd"],
        ["metadata", s.metadata?.app === app && s.metadata?.kind === "pass" && s.metadata?.passId === pass.id],
        ["claim url", (s.success_url ?? "").startsWith(`${origin}/api/billing/pass/claim?session_id=`)],
        ["pricing page shows the pass price", pricing.includes(usd(pass.priceCents))],
      ];
      for (const [n, ok] of checks) if (!ok) failed.push(n);
    } catch (e) {
      failed.push((e as Error).message.slice(0, 200));
    } finally {
      if (id) {
        const ex = await stripe.checkout.sessions.expire(id).catch((e) => ({ status: `expire failed: ${(e as Error).message}` }));
        if (ex.status !== "expired") failed.push("session not expired");
      }
    }
    results.push({ app, flow, ok: failed.length === 0, failed });
  }

  for (const plan of catalog.plans.filter((p) => p.priceMonthlyCents > 0 && p.stripeLookupKey)) {
    const flow = `plan ${plan.id} ${usd(plan.priceMonthlyCents)}/month`;
    const failed: string[] = [];
    let id: string | undefined;
    try {
      const anon = await retry(async () => {
        const r = await fetch(`${origin}/api/billing/checkout`, {
          method: "POST",
          headers: { "content-type": "application/json", origin, "user-agent": UA },
          body: JSON.stringify({ planId: plan.id }),
        });
        if (r.status >= 500) throw new Error(`plan checkout HTTP ${r.status}`);
        return r.status;
      });
      if (anon !== 401) failed.push(`anonymous plan checkout answered ${anon}, want 401`);
      const prices = (await stripe.prices.list({ lookup_keys: [plan.stripeLookupKey!], active: true, limit: 5 })).data;
      const price = prices[0];
      if (prices.length !== 1 || !price) throw new Error(`expected one active live price ${plan.stripeLookupKey}, found ${prices.length}`);
      if (!price.livemode) failed.push("price not live");
      if (price.unit_amount !== plan.priceMonthlyCents || price.currency !== "usd") failed.push(`price is ${price.unit_amount} ${price.currency}, catalog ${plan.priceMonthlyCents}`);
      if (price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) failed.push("price is not monthly");
      if (!pricing.includes(usd(plan.priceMonthlyCents))) failed.push("pricing page does not show the plan price");
      const s = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${origin}/account/billing?checkout=success`,
        cancel_url: `${origin}/pricing`,
        metadata: { app, smoke: "checkout-health", never_pay: "expired at once" },
      });
      id = s.id;
      if (!s.url?.startsWith("https://checkout.stripe.com/")) failed.push("no checkout url");
      if (s.amount_total !== plan.priceMonthlyCents) failed.push(`session amount ${s.amount_total}`);
    } catch (e) {
      failed.push((e as Error).message.slice(0, 200));
    } finally {
      if (id) {
        const ex = await stripe.checkout.sessions.expire(id).catch((e) => ({ status: `expire failed: ${(e as Error).message}` }));
        if (ex.status !== "expired") failed.push("session not expired");
      }
    }
    results.push({ app, flow, ok: failed.length === 0, failed });
  }
}

for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.app} ${r.flow}${r.failed.length ? ` — ${r.failed.join("; ")}` : ""}`);
const ok = results.length > 0 && results.every((r) => r.ok);
writeFileSync(outFile, JSON.stringify({ mode: "live", ok, finished_at: new Date().toISOString(), checks: results }, null, 2));
process.exit(ok ? 0 : 1);
