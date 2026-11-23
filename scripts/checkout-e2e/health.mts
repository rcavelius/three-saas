/**
 * Merges this run's results into docs/growth/checkout-health.json, which the traffic boss reads first
 * (docs/growth/BOSS.md). Pass/fail per flow and dates only, never secrets or Stripe ids. A section that did not
 * run this time (weekly test-mode e2e vs. daily live smoke) keeps its last result.
 *
 *   npx tsx scripts/checkout-e2e/health.mts <resultsDir> [runUrl]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir = "results", runUrl = ""] = process.argv.slice(2);
const FILE = "docs/growth/checkout-health.json";
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};

function walk(d: string): string[] {
  if (!existsSync(d)) return [];
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dir).filter((p) => p.endsWith(".json"));
const e2e = files.map((p) => JSON.parse(readFileSync(p, "utf8"))).filter((r) => r.mode === "test" && r.app);
const live = files.map((p) => JSON.parse(readFileSync(p, "utf8"))).find((r) => r.mode === "live");
const expectedApps = (process.env.E2E_APPS ?? "").split(",").filter(Boolean);

let testMode = prev.test_mode ?? null;
if (expectedApps.length) {
  const flows: { app: string; flow: string; ok: boolean; failed_steps: string[] }[] = [];
  for (const app of expectedApps) {
    const r = e2e.find((x) => x.app === app);
    if (!r) {
      flows.push({ app, flow: "whole run", ok: false, failed_steps: ["no result (build, server start or test crashed; see the workflow run)"] });
      continue;
    }
    for (const f of r.flows) {
      flows.push({
        app,
        flow: f.flow,
        ok: f.ok,
        failed_steps: [...f.steps.filter((s: { ok: boolean }) => !s.ok).map((s: { name: string; detail?: string }) => (s.detail ? `${s.name} (${s.detail})` : s.name)), ...(f.error ? [`stopped: ${f.error}`] : [])].map((s: string) =>
          s.replace(/(cs|cus|sub|pi|whsec|sk|rk)_(test|live)_[A-Za-z0-9]+/g, "$1_…").slice(0, 300),
        ),
      });
    }
  }
  testMode = { run_at: new Date().toISOString(), ok: flows.every((f) => f.ok), flows };
}

let liveSmoke = prev.live_smoke ?? null;
if (process.env.LIVE_RAN === "1") {
  liveSmoke = live
    ? { run_at: live.finished_at, ok: live.ok, checks: live.checks.map((c: { app: string; flow: string; ok: boolean; failed: string[] }) => ({ app: c.app, flow: c.flow, ok: c.ok, failed: c.failed })) }
    : { run_at: new Date().toISOString(), ok: false, checks: [{ app: "all", flow: "live smoke", ok: false, failed: ["no result (script crashed; see the workflow run)"] }] };
}

const out = {
  about:
    "Checkout health. test_mode = weekly real-browser purchase of every pass and one monthly plan per app with Stripe TEST cards (free limit → paywall → Stripe Checkout → webhook → unlock cookie/link → paid limits). live_smoke = daily live Checkout sessions opened through the live sites and expired unpaid. Written by .github/workflows/checkout-e2e.yml.",
  updated_at: new Date().toISOString(),
  ok: (testMode?.ok ?? false) && (liveSmoke?.ok ?? false),
  last_run: runUrl || undefined,
  test_mode: testMode,
  live_smoke: liveSmoke,
};
writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
console.log(`checkout health: ${out.ok ? "OK" : "FAILING"} (test_mode ${testMode?.ok}, live_smoke ${liveSmoke?.ok})`);
