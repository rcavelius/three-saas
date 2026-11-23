/**
 * Shared pieces of the checkout end-to-end test (scripts/checkout-e2e/run.mts): Stripe TEST-mode guard, the
 * hosted Checkout form, webhook delivery (Stripe CLI `stripe listen` or a signed replay), the app database
 * (service Postgres, read-only asserts), the email outbox, and the step log that becomes result.json.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import pg from "pg";
import Stripe from "stripe";

export type AppName = "gridrinse" | "changekite" | "webhooktrail";

export interface Ctx {
  app: AppName;
  base: string;
  outDir: string;
  stripe: Stripe;
  db: pg.Pool;
  /** Unix seconds when this run started (Stripe event filter). */
  started: number;
  /** "cli": `stripe listen --forward-to` delivers events; "replay": this process signs and posts them. */
  webhookMode: "cli" | "replay";
  /** Only for replay: the app's STRIPE_WEBHOOK_SECRET. */
  webhookSecret?: string;
  /** Stripe objects to clean up at the end (test mode). */
  cleanup: { customers: Set<string>; subscriptions: Set<string> };
}

export function makeCtx(app: AppName): Ctx {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  // Hard guard: this test pays with test cards. It must never run against a live key.
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) throw new Error("Refusing: STRIPE_SECRET_KEY is not a Stripe TEST key");
  const port = process.env.PORT ?? "3102";
  const outDir = process.env.OUT_DIR ?? `checkout-e2e-out/${app}`;
  mkdirSync(outDir, { recursive: true });
  const mode = process.env.WEBHOOK_MODE === "replay" ? "replay" : "cli";
  if (mode === "replay" && !process.env.STRIPE_WEBHOOK_SECRET) throw new Error("WEBHOOK_MODE=replay needs STRIPE_WEBHOOK_SECRET");
  return {
    app,
    base: `http://localhost:${port}`,
    outDir,
    stripe: new Stripe(key),
    db: new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }),
    started: Math.floor(Date.now() / 1000) - 5,
    webhookMode: mode,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    cleanup: { customers: new Set(), subscriptions: new Set() },
  };
}

// ---- step log ------------------------------------------------------------------------------------

export interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}
export interface FlowResult {
  flow: string;
  ok: boolean;
  steps: Step[];
  error?: string;
  seconds: number;
}

export class Flow {
  steps: Step[] = [];
  private t0 = Date.now();
  constructor(readonly name: string) {}
  check(name: string, ok: boolean, detail = ""): boolean {
    this.steps.push({ name, ok, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
    console.log(`${ok ? "PASS" : "FAIL"}  [${this.name}] ${name}${detail ? "  — " + detail.slice(0, 300) : ""}`);
    return ok;
  }
  /** A check that must pass for the flow to continue. */
  must(name: string, ok: boolean, detail = ""): void {
    if (!this.check(name, ok, detail)) throw new Error(`${name} failed${detail ? ": " + detail : ""}`);
  }
  result(error?: string): FlowResult {
    const ok = !error && this.steps.length > 0 && this.steps.every((s) => s.ok);
    return { flow: this.name, ok, steps: this.steps, ...(error ? { error: error.slice(0, 500) } : {}), seconds: Math.round((Date.now() - this.t0) / 1000) };
  }
}

export function writeResult(ctx: Ctx, flows: FlowResult[]): boolean {
  const ok = flows.length > 0 && flows.every((f) => f.ok);
  const out = { app: ctx.app, mode: "test", ok, finished_at: new Date().toISOString(), flows };
  writeFileSync(join(ctx.outDir, "result.json"), JSON.stringify(out, null, 2));
  return ok;
}

// ---- waiting ---------------------------------------------------------------------------------------

export async function until<T>(what: string, fn: () => Promise<T | null | undefined | false>, timeoutMs = 60_000, everyMs = 1000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown = null;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (${(last as Error).message})` : ""}`);
}

// ---- database (read-only asserts) --------------------------------------------------------------------

export async function q<T extends Record<string, unknown>>(ctx: Ctx, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await ctx.db.query<T>(sql, params)).rows;
}

/** Newest link containing `pathPart` in an email to `to` (the app's email outbox). */
export async function mailLink(ctx: Ctx, to: string, pathPart: string): Promise<string> {
  return until(`email to ${to} with ${pathPart}`, async () => {
    const rows = await q<{ text_body: string }>(ctx, `SELECT text_body FROM ops_email_outbox WHERE to_address = $1 ORDER BY created_at DESC LIMIT 10`, [to]);
    for (const r of rows) {
      const m = (r.text_body.match(/https?:\/\/[^\s<>"]+/g) ?? []).find((u) => u.includes(pathPart));
      if (m) return m;
    }
    return null;
  });
}

export async function mailSubjects(ctx: Ctx, to: string): Promise<string[]> {
  return (await q<{ subject: string }>(ctx, `SELECT subject FROM ops_email_outbox WHERE to_address = $1 ORDER BY created_at`, [to])).map((r) => r.subject);
}

// ---- webhooks --------------------------------------------------------------------------------------

const replayed = new Set<string>();

/**
 * Makes sure Stripe's events about `objectId` (a Checkout Session, customer or subscription id) reached the app.
 * cli mode: `stripe listen` forwards them on its own; nothing to do here (callers wait on the database).
 * replay mode: fetch the real events from Stripe and post them signed with the app's webhook secret.
 */
export async function deliverEvents(ctx: Ctx, objectId: string): Promise<string[]> {
  if (ctx.webhookMode === "cli") return [];
  await new Promise((r) => setTimeout(r, 2500));
  const sent: string[] = [];
  const events = (await ctx.stripe.events.list({ created: { gte: ctx.started }, limit: 100 })).data.reverse();
  for (const e of events) {
    if (replayed.has(e.id) || !JSON.stringify(e.data.object).includes(objectId)) continue;
    const payload = JSON.stringify(e);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", ctx.webhookSecret!).update(`${t}.${payload}`).digest("hex");
    const res = await fetch(`${ctx.base}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` },
      body: payload,
    });
    replayed.add(e.id);
    sent.push(`${e.type}:${res.status}`);
  }
  return sent;
}

/** billing_events rows of this run (the app's webhook log). */
export async function webhookLog(ctx: Ctx): Promise<{ type: string; outcome: string | null; error: string | null; org_id: string | null }[]> {
  return q(ctx, `SELECT type, outcome, error, org_id FROM billing_events WHERE received_at >= to_timestamp($1) ORDER BY received_at`, [ctx.started]);
}

// ---- Stripe hosted Checkout (test mode) ------------------------------------------------------------

/** On checkout.stripe.com: checks the amount shown, pays with the 4242 test card, waits until back on the app. */
export async function payOnStripe(ctx: Ctx, page: Page, flow: Flow, o: { amountText: string; email?: string; shot: string }): Promise<void> {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });
  flow.must("redirects to Stripe hosted Checkout (test mode)", page.url().includes("cs_test_"), new URL(page.url()).host);
  await page.locator("body").getByText(o.amountText).first().waitFor({ timeout: 30_000 });
  flow.check(`Stripe shows the price ${o.amountText}`, true);
  // Anonymous pass buyers type their email on Stripe's page; signed-in buyers arrive with it prefilled.
  const email = page.locator("#email");
  if ((await email.isVisible().catch(() => false)) && (await email.isEditable().catch(() => false)) && !(await email.inputValue().catch(() => ""))) {
    await email.fill(o.email ?? `checkout-e2e-buyer-${Date.now()}@example.com`);
  }
  // Payment methods are an accordion (Card, Cash App Pay, Klarna, Bank…): open "Card".
  const card = page.locator("#cardNumber");
  const tries: (() => Promise<unknown>)[] = [
    () => page.locator('[data-testid="card-accordion-item-button"], #payment-method-accordion-item-title-card').filter({ visible: true }).first().click({ timeout: 3000 }),
    () => page.getByRole("radio", { name: /^Card/ }).first().check({ force: true, timeout: 3000 }),
    () => page.getByText("Card", { exact: true }).filter({ visible: true }).first().click({ timeout: 3000 }),
    () => page.getByRole("button", { name: /^Card/ }).filter({ visible: true }).first().click({ timeout: 3000 }),
  ];
  for (const t of tries) {
    if (await card.isVisible().catch(() => false)) break;
    await t().catch(() => undefined);
    await card.waitFor({ state: "visible", timeout: 4000 }).catch(() => undefined);
  }
  await page.screenshot({ path: join(ctx.outDir, `${o.shot}-stripe-form.png`) });
  await card.waitFor({ timeout: 30_000 });
  await card.fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  if (await page.locator("#billingName").count()) await page.locator("#billingName").fill("Checkout Robot");
  if (await page.locator("#billingCountry").count()) await page.locator("#billingCountry").selectOption("US").catch(() => undefined);
  if (await page.locator("#billingPostalCode").count()) await page.locator("#billingPostalCode").fill("10001").catch(() => undefined);
  const link = page.getByRole("checkbox", { name: /Save my information|faster checkout/i });
  if ((await link.count()) && (await link.first().isChecked().catch(() => false))) await link.first().uncheck({ force: true }).catch(() => undefined);
  await page.screenshot({ path: join(ctx.outDir, `${o.shot}-stripe.png`) });
  await page.locator('[data-testid="hosted-payment-submit-button"], button.SubmitButton').first().click();
  await page.waitForURL((u) => u.toString().startsWith(ctx.base), { timeout: 90_000 });
  flow.check("test card 4242 accepted, Stripe returns to the app", true, page.url().replace(ctx.base, ""));
}

/**
 * Holds the browser on Stripe's success redirect to the pass claim route until the webhook alone has recorded the
 * pass, so the test proves webhook delivery (not just the claim route's own Stripe lookup).
 */
export async function holdClaimUntilWebhook(ctx: Ctx, page: Page, flow: Flow): Promise<{ sessionId: () => string }> {
  let sessionId = "";
  await page.route("**/api/billing/pass/claim**", async (route) => {
    const u = new URL(route.request().url());
    sessionId = u.searchParams.get("session_id") ?? "";
    try {
      const sent = await deliverEvents(ctx, sessionId);
      if (sent.length) console.log("  replayed:", sent.join(" "));
      await until(
        "webhook to record the pass",
        async () => (await q(ctx, `SELECT id FROM billing_passes WHERE id = $1`, [sessionId]))[0],
        90_000,
      );
      const log = await webhookLog(ctx);
      const done = log.find((e) => e.type === "checkout.session.completed" && e.outcome === "processed");
      flow.check("webhook checkout.session.completed delivered and recorded the pass", !!done, log.map((e) => `${e.type}=${e.outcome}${e.error ? `(${e.error})` : ""}`).join(", "));
    } catch (e) {
      flow.check("webhook checkout.session.completed delivered and recorded the pass", false, (e as Error).message);
    }
    await page.unroute("**/api/billing/pass/claim**");
    await route.continue();
  });
  return { sessionId: () => sessionId };
}

/** The visitor's pass cookie after the claim (name ends in "_pass"). */
export async function passCookie(context: BrowserContext, base: string) {
  return (await context.cookies(base)).find((c) => /_pass$/.test(c.name)) ?? null;
}

/** Remembers the pass buyer's Stripe customer (customer_creation: always) for cleanup. */
export async function rememberSessionCustomer(ctx: Ctx, sessionId: string): Promise<Stripe.Checkout.Session | null> {
  if (!sessionId) return null;
  const s = await ctx.stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
  if (typeof s.customer === "string") ctx.cleanup.customers.add(s.customer);
  return s;
}

export async function cleanupStripe(ctx: Ctx): Promise<void> {
  for (const s of ctx.cleanup.subscriptions) await ctx.stripe.subscriptions.cancel(s).catch(() => undefined);
  for (const c of ctx.cleanup.customers) await ctx.stripe.customers.del(c).catch(() => undefined);
}

export function fakeEmail(app: string, flow: string): string {
  return `checkout-e2e-${app}-${flow}-${Date.now()}@example.com`;
}
