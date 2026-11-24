/**
 * Checkout end-to-end test, Stripe TEST mode only: drives a real headless browser through every way to pay on one
 * app's production build (`next start` on localhost:$PORT, service Postgres), from the free limit to the unlock.
 *
 *   STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=postgres://... PORT=3102 OUT_DIR=out/<app> \
 *     [WEBHOOK_MODE=replay STRIPE_WEBHOOK_SECRET=whsec_...] npx tsx scripts/checkout-e2e/run.mts <app>
 *
 * Webhooks: by default `stripe listen --forward-to` (started by the workflow) delivers Stripe's real events; with
 * WEBHOOK_MODE=replay this process signs and posts them itself. Writes OUT_DIR/result.json (no secrets).
 * Run by .github/workflows/checkout-e2e.yml. Never run it with a live key: it refuses.
 */
import { chromium } from "@playwright/test";
import * as changekite from "./changekite.mts";
import * as gridrinse from "./gridrinse.mts";
import { Flow, cleanupStripe, makeCtx, writeResult, type AppName, type FlowResult } from "./harness.mts";
import * as webhooktrail from "./webhooktrail.mts";

const app = process.argv[2] as AppName;
const FLOWS = { gridrinse, changekite, webhooktrail }[app];
if (!FLOWS) throw new Error("usage: run.mts <gridrinse|changekite|webhooktrail>");
const ctx = makeCtx(app);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const results: FlowResult[] = [];
const flows: [string, (c: typeof ctx, b: typeof browser) => Promise<Flow>][] = [
  ["pass", FLOWS.passFlow],
  ["plan", FLOWS.planFlow],
];
if ("templateFlow" in FLOWS) flows.push(["template", FLOWS.templateFlow]);
for (const [name, run] of flows) {
  try {
    results.push((await run(ctx, browser)).result());
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`FAIL  [${app} ${name}] ${msg}`);
    // run() threw before returning its Flow: report what we know.
    const f = (e as { flow?: Flow }).flow;
    results.push(f ? f.result(msg) : { flow: `${app} ${name}`, ok: false, steps: [], error: msg.slice(0, 500), seconds: 0 });
  }
}
await browser.close();
await cleanupStripe(ctx);
await ctx.db.end();
const ok = writeResult(ctx, results);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.flow}: ${r.steps.filter((s) => s.ok).length}/${r.steps.length} steps${r.error ? ` — ${r.error}` : ""}`);
process.exit(ok ? 0 : 1);
