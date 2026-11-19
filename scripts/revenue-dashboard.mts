/**
 * Revenue funnel per product, from each app's production database (first-party analytics) and Stripe.
 *   npx tsx scripts/revenue-dashboard.mts [days=30]            (reads .secrets/cloudflare-<app>.json locally)
 * In GitHub Actions the same values come from env: DATABASE_URL_<APP>, STRIPE_SECRET_KEY.
 * Marketing spend for CAC is read from docs/marketing-spend.json: [{ "date": "2026-11-20", "app": "gridrinse", "usd": 25, "channel": "..." }].
 *
 * Definitions
 *  - Visitors: distinct anonymous browser ids with a pageview.
 *  - Qualified visitors: distinct ids that viewed /pricing or /signup, used the free tool, or started sign-up.
 *  - Pricing views: pageviews of /pricing.  Checkout starts: checkout_started events.
 *  - Paid subscriptions / MRR / cancellations / refunds: from Stripe, by price lookup key prefix "<app>_".
 *  - CAC: marketing spend in the window / new paid subscriptions in the window.
 * Test-mode Stripe data is labelled as such; live numbers appear once live keys are in use.
 */
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import pg from "pg";
import Stripe from "stripe";

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86_400_000);
const apps = ["gridrinse", "changekite", "webhooktrail"] as const;

function secretFor(app: string) {
  const file = `.secrets/cloudflare-${app}.json`;
  const local = existsSync(file) ? JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")) : {};
  return {
    db: process.env[`DATABASE_URL_${app.toUpperCase()}`] ?? local.DATABASE_URL,
    stripeKey: process.env.STRIPE_SECRET_KEY ?? local.STRIPE_SECRET_KEY,
  };
}
const spend: { date: string; app: string; usd: number }[] = existsSync("docs/marketing-spend.json")
  ? JSON.parse(readFileSync("docs/marketing-spend.json", "utf8"))
  : [];

const rows: Record<string, string | number>[] = [];
const stripeKey = secretFor("gridrinse").stripeKey;
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const mode = stripeKey?.includes("_live_") ? "live" : "test";

// Stripe: all subscriptions and refunds once, then split by app via the price lookup key.
const subs: Stripe.Subscription[] = [];
const refunds: Stripe.Refund[] = [];
if (stripe) {
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items.data.price"] })) subs.push(s);
  for await (const r of stripe.refunds.list({ created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 })) refunds.push(r);
}
const appOf = (s: Stripe.Subscription) => (s.items.data[0]?.price.lookup_key ?? "").split("_")[0];

for (const app of apps) {
  const { db: url } = secretFor(app);
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const one = async (sql: string) => Number((await db.query(sql, [since])).rows[0]?.n ?? 0);
  const visitors = await one(`SELECT count(DISTINCT anonymous_id) n FROM analytics_events WHERE name='pageview' AND created_at >= $1`);
  const qualified = await one(`SELECT count(DISTINCT anonymous_id) n FROM analytics_events WHERE created_at >= $1 AND (
      (name='pageview' AND (path LIKE '/pricing%' OR path LIKE '/signup%')) OR name IN ('tool_used','signup_started','upgrade_clicked','checkout_started'))`);
  const pricing = await one(`SELECT count(*) n FROM analytics_events WHERE name='pageview' AND path LIKE '/pricing%' AND created_at >= $1`);
  const signups = await one(`SELECT count(*) n FROM analytics_events WHERE name='signup_completed' AND created_at >= $1`);
  const checkouts = await one(`SELECT count(*) n FROM analytics_events WHERE name='checkout_started' AND created_at >= $1`);
  await db.end();

  const mine = subs.filter((s) => appOf(s) === app);
  const active = mine.filter((s) => ["active", "past_due", "trialing"].includes(s.status));
  const mrrCents = active.reduce((sum, s) => sum + s.items.data.reduce((a, i) => a + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0), 0);
  const newPaid = mine.filter((s) => s.created * 1000 >= since.getTime() && s.status !== "incomplete" && s.status !== "incomplete_expired").length;
  const canceled = mine.filter((s) => (s.canceled_at ?? 0) * 1000 >= since.getTime()).length;
  const pendingCancel = active.filter((s) => s.cancel_at_period_end).length;
  const customerIds = new Set(mine.map((s) => (typeof s.customer === "string" ? s.customer : s.customer.id)));
  const appRefunds = refunds.filter((r) => r.metadata?.app === app || (typeof r.charge === "object" && customerIds.has(String(r.charge?.customer))));
  const spendUsd = spend.filter((x) => x.app === app && new Date(x.date) >= since).reduce((a, x) => a + x.usd, 0);
  rows.push({
    product: app,
    visitors,
    "qualified visitors": qualified,
    "pricing views": pricing,
    signups,
    "checkout starts": checkouts,
    [`new paid subs (${mode})`]: newPaid,
    [`active paid subs (${mode})`]: active.length,
    [`MRR USD (${mode})`]: (mrrCents / 100).toFixed(2),
    "cancellations": `${canceled} done, ${pendingCancel} at period end`,
    refunds: appRefunds.length,
    "spend USD": spendUsd.toFixed(2),
    CAC: newPaid ? `$${(spendUsd / newPaid).toFixed(2)}` : spendUsd ? "no paid subs yet" : "n/a",
    "visitor → checkout": visitors ? `${((checkouts / visitors) * 100).toFixed(1)}%` : "n/a",
  });
}

const headers = Object.keys(rows[0]!);
const md = [
  `## Revenue funnel — last ${days} days (Stripe ${mode} mode) — ${new Date().toISOString().slice(0, 16)}Z`,
  "",
  `| metric | ${rows.map((r) => r.product).join(" | ")} |`,
  `|---|${rows.map(() => "---").join("|")}|`,
  ...headers.filter((h) => h !== "product").map((h) => `| ${h} | ${rows.map((r) => r[h]).join(" | ")} |`),
  "",
  "Visitor counts include the owner's own and automated test visits until real traffic dominates.",
].join("\n");
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
