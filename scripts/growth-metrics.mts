/**
 * Daily growth numbers for a product's sales agents. Counts only: no emails, names, ids or IP addresses ever go
 * into the file (it is committed to the repo).
 *   npx tsx scripts/growth-metrics.mts [gridrinse|changekite|webhooktrail]      (default gridrinse)
 * GridRinse writes docs/growth/metrics.json (rulebook docs/growth/AGENT.md); the others write
 * docs/growth/<app>/metrics.json (rulebook docs/growth/<app>/AGENT.md).
 * Locally reads .secrets/cloudflare-<app>.json; in GitHub Actions DATABASE_URL_<APP> and STRIPE_SECRET_KEY.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import Stripe from "stripe";

const APPS = ["gridrinse", "changekite", "webhooktrail"] as const;
const app = (process.argv[2] ?? "gridrinse") as (typeof APPS)[number];
if (!APPS.includes(app)) throw new Error(`Unknown app "${app}" (expected one of ${APPS.join(", ")})`);
const outDir = app === "gridrinse" ? "docs/growth" : `docs/growth/${app}`;
const secretsFile = `.secrets/cloudflare-${app}.json`;
const dbVar = `DATABASE_URL_${app.toUpperCase()}`;

const local = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8").replace(/^﻿/, "")) : {};
const db = process.env[dbVar] ?? local.DATABASE_URL;
const stripeKey = process.env.STRIPE_SECRET_KEY ?? local.STRIPE_SECRET_KEY;
if (!db) throw new Error(`${dbVar} is not set`);

const client = new pg.Client({ connectionString: db });
await client.connect();
const q = async <T,>(sql: string, args: unknown[] = []) => (await client.query(sql, args)).rows as T[];
const n = (v: unknown) => Number(v ?? 0);

async function windowStats(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [ev] = await q<Record<string, string>>(
    `SELECT
       count(DISTINCT anonymous_id) FILTER (WHERE name = 'pageview') AS visitors,
       count(*) FILTER (WHERE name = 'pageview') AS pageviews,
       count(DISTINCT anonymous_id) FILTER (WHERE name = 'tool_used') AS tool_users,
       count(*) FILTER (WHERE name = 'tool_used') AS tool_runs,
       count(DISTINCT anonymous_id) FILTER (WHERE name = 'signup_started') AS signup_starts,
       count(*) FILTER (WHERE name = 'pageview' AND path = '/pricing') AS pricing_views,
       count(*) FILTER (WHERE name = 'checkout_started') AS checkout_starts
     FROM analytics_events WHERE created_at >= $1`,
    [since],
  );
  const pages = await q<{ path: string; views: string; visitors: string }>(
    `SELECT path, count(*) AS views, count(DISTINCT anonymous_id) AS visitors
       FROM analytics_events WHERE name = 'pageview' AND created_at >= $1 AND path NOT LIKE '/admin%' AND path NOT LIKE '/account%'
      GROUP BY path ORDER BY count(*) DESC LIMIT 40`,
    [since],
  );
  const [acc] = await q<{ new_accounts: string }>(`SELECT count(*) AS new_accounts FROM auth_user WHERE "createdAt" >= $1`, [since]).catch(
    () => [{ new_accounts: "0" }],
  );
  return {
    days,
    visitors: n(ev?.visitors),
    pageviews: n(ev?.pageviews),
    tool_users: n(ev?.tool_users),
    tool_runs: n(ev?.tool_runs),
    pricing_views: n(ev?.pricing_views),
    signup_starts: n(ev?.signup_starts),
    checkout_starts: n(ev?.checkout_starts),
    new_accounts: n(acc?.new_accounts),
    top_pages: pages.map((p) => ({ path: p.path, views: n(p.views), visitors: n(p.visitors) })),
  };
}

const [accounts] = await q<{ total: string }>(`SELECT count(*) AS total FROM auth_user`).catch(() => [{ total: "0" }]);
const subRows = await q<{ plan_id: string; status: string }>(`SELECT plan_id, status FROM billing_subscriptions`);
const windows = { last_1d: await windowStats(1), last_7d: await windowStats(7), last_30d: await windowStats(30) };
await client.end();

// Paid customers straight from Stripe (the source of truth), this product's prices only (one account sells all three).
let stripeStats: Record<string, unknown> = { available: false };
if (stripeKey) {
  const stripe = new Stripe(stripeKey);
  const live = stripeKey.includes("_live_");
  let active = 0, mrrCents = 0, everPaid = 0, canceled = 0;
  const firstPaidDates: string[] = [];
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items.data.price"] })) {
    const price = s.items.data[0]?.price;
    if (!price?.lookup_key?.startsWith(`${app}_`)) continue;
    const paidStatuses = ["active", "past_due", "trialing"];
    if (paidStatuses.includes(s.status)) {
      active++;
      mrrCents += (price.unit_amount ?? 0) * (s.items.data[0]?.quantity ?? 1);
    }
    if (s.status === "canceled") canceled++;
    if (s.status !== "incomplete" && s.status !== "incomplete_expired") {
      everPaid++;
      firstPaidDates.push(new Date(s.created * 1000).toISOString().slice(0, 10));
    }
  }
  stripeStats = { available: true, mode: live ? "live" : "test", active_paid_subscriptions: active, mrr_usd: mrrCents / 100, subscriptions_ever: everPaid, canceled, subscription_start_dates: firstPaidDates.sort() };
}

const out = {
  generated_at: new Date().toISOString(),
  product: app,
  accounts_total: n(accounts?.total),
  subscriptions_in_db: subRows.reduce<Record<string, number>>((m, r) => ((m[`${r.plan_id}:${r.status}`] = (m[`${r.plan_id}:${r.status}`] ?? 0) + 1), m), {}),
  stripe: stripeStats,
  ...windows,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/metrics.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`${app} metrics: visitors 7d ${out.last_7d.visitors}, accounts ${out.accounts_total}, paid ${JSON.stringify((stripeStats as { active_paid_subscriptions?: number }).active_paid_subscriptions ?? "n/a")}`);
