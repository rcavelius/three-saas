/**
 * WebhookTrail: free limit (3 active endpoints) → paywall → 7-day pass ($5) on Stripe test Checkout → webhook →
 * pass cookie and unlock link → Developer capture limits and replay included; and the Developer monthly plan ($9).
 */
import type { Browser, Page } from "@playwright/test";
import {
  Flow,
  deliverEvents,
  fakeEmail,
  holdClaimUntilWebhook,
  mailLink,
  passCookie,
  payOnStripe,
  q,
  rememberSessionCustomer,
  until,
  webhookLog,
  type Ctx,
} from "./harness.mts";

interface EndpointList {
  pass?: { name: string; expiresAt: string; unlockPath: string } | null;
  endpoints?: { id: string; captureUrl?: string; maxRequests?: number; permissions?: { replayIncluded?: boolean } }[];
  limits?: Record<string, number>;
}

async function list(page: Page, base: string): Promise<EndpointList> {
  return page.evaluate(async (b) => (await fetch(`${b}/api/endpoints`, { credentials: "same-origin" })).json(), base);
}
async function create(page: Page, base: string): Promise<{ status: number; body: { error?: unknown; id?: string; captureUrl?: string } }> {
  return page.evaluate(async (b) => {
    const r = await fetch(`${b}/api/endpoints`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, base);
}

export async function passFlow(ctx: Ctx, browser: Browser): Promise<Flow> {
  const f = new Flow("webhooktrail 7-day pass $5");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${ctx.base}/`);
    for (let i = 0; i < 3; i++) {
      const r = await create(page, ctx.base);
      f.must(`free endpoint ${i + 1} of 3 created`, r.status === 200 || r.status === 201, `HTTP ${r.status}`);
    }
    const free = await list(page, ctx.base);
    const ep = free.endpoints?.[0];
    f.check("free endpoints keep 100 requests, no replay", ep?.maxRequests === 100 && ep.permissions?.replayIncluded === false && !free.pass, JSON.stringify({ max: ep?.maxRequests, replay: ep?.permissions?.replayIncluded }));
    const cap = await fetch(ep!.captureUrl!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hello: "checkout-e2e" }) });
    f.check("free endpoint captures a webhook", cap.status === 200, `HTTP ${cap.status}`);

    await page.goto(`${ctx.base}/`);
    await page.getByRole("button", { name: "Create endpoint" }).first().click();
    const alert = page.getByRole("alert").filter({ hasText: /limited to 3 active/ });
    await alert.first().waitFor({ timeout: 20_000 });
    f.check("4th endpoint refused: free limit hit", true, (await alert.first().innerText()).slice(0, 120));
    await page.getByText("Up to 25 endpoints with the 7-day pass").first().waitFor({ timeout: 10_000 });
    f.check("paywall shows (Up to 25 endpoints with the 7-day pass)", true);
    const buy = page.getByRole("button", { name: /Get the 7-day pass — \$5/ }).first();
    f.must("paywall offers the 7-day pass for $5", (await buy.count()) > 0);
    await page.screenshot({ path: `${ctx.outDir}/pass-paywall.png` });

    const claim = await holdClaimUntilWebhook(ctx, page, f);
    await buy.click();
    await payOnStripe(ctx, page, f, { amountText: "$5.00", shot: "pass" });
    await page.waitForLoadState("load");
    const sessionId = claim.sessionId();
    const session = await rememberSessionCustomer(ctx, sessionId);
    f.check(
      "Stripe session: paid, payment mode, webhooktrail_week_pass $5",
      session?.payment_status === "paid" && session.mode === "payment" && session.line_items?.data[0]?.price?.lookup_key === "webhooktrail_week_pass" && session.amount_total === 500,
      `${session?.payment_status} ${session?.amount_total}`,
    );
    f.check("claim redirects back with ?pass=active", /[?&]pass=active/.test(claim.location()), claim.location().replace(ctx.base, ""));
    await page.getByText(/Payment received/).first().waitFor({ timeout: 15_000 }).then(
      () => f.check("page confirms the pass (Payment received)", true),
      () => f.check("page confirms the pass (Payment received)", false),
    );
    const cookie = await passCookie(context, ctx.base);
    f.must("signed pass cookie wt_pass set (HttpOnly, SameSite=Lax)", cookie?.name === "wt_pass" && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.value.startsWith(sessionId + "."), cookie?.name ?? "none");
    const row = (await q<{ pass_id: string; expires_at: Date }>(ctx, `SELECT pass_id, expires_at FROM billing_passes WHERE id = $1`, [sessionId]))[0];
    const days = row ? (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000 : 0;
    f.check("pass recorded for 7 days", !!row && row.pass_id === "week" && days > 6.95 && days <= 7.01, `${days.toFixed(3)} d`);

    const paid = await list(page, ctx.base);
    f.must("endpoints API reports the 7-day pass", paid.pass?.name === "7-day pass", JSON.stringify(paid.pass));
    const pe = paid.endpoints?.find((e) => e.id === ep!.id);
    f.check("pass raises the existing endpoint to Developer limits (2,000 requests, replay included)", pe?.maxRequests === 2000 && pe.permissions?.replayIncluded === true, JSON.stringify({ max: pe?.maxRequests, replay: pe?.permissions?.replayIncluded }));
    const fourth = await create(page, ctx.base);
    f.check("4th endpoint now allowed by the pass", fourth.status === 200 || fourth.status === 201, `HTTP ${fourth.status}`);
    await page.screenshot({ path: `${ctx.outDir}/pass-active.png`, fullPage: true });

    // Forged cookie: Free.
    const forged = await browser.newContext();
    await forged.addCookies([{ ...cookie!, value: `${sessionId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` }]);
    const fp = await forged.newPage();
    await fp.goto(`${ctx.base}/`);
    f.check("forged pass cookie is ignored", !(await list(fp, ctx.base)).pass);
    await forged.close();

    // Unlock link on another device.
    const other = await browser.newContext();
    const op = await other.newPage();
    await op.goto(new URL(paid.pass!.unlockPath, ctx.base).toString());
    f.check("unlock link on a new device lands with ?pass=active", /[?&]pass=active/.test(op.url()), op.url().replace(ctx.base, ""));
    f.check("unlock link sets wt_pass on the new device", (await passCookie(other, ctx.base))?.name === "wt_pass");
    const made = await create(op, ctx.base);
    const ol = await list(op, ctx.base);
    const oe = ol.endpoints?.[0];
    f.check(
      "new device: endpoint gets Developer limits from the pass",
      (made.status === 200 || made.status === 201) && ol.pass?.name === "7-day pass" && oe?.maxRequests === 2000 && oe.permissions?.replayIncluded === true,
      JSON.stringify({ status: made.status, pass: ol.pass?.name, max: oe?.maxRequests }),
    );
    await other.close();

    const log = await webhookLog(ctx);
    f.check("no webhook failed", log.every((e) => e.outcome !== "failed" && e.outcome !== "unknown_price"), log.map((e) => `${e.type}=${e.outcome}`).join(", "));
  } catch (e) {
    Object.assign(e as object, { flow: f });
    throw e;
  } finally {
    await page.screenshot({ path: `${ctx.outDir}/pass-last.png`, fullPage: true }).catch(() => undefined);
    await context.close();
  }
  return f;
}

export async function planFlow(ctx: Ctx, browser: Browser): Promise<Flow> {
  const f = new Flow("webhooktrail Developer monthly $9");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const email = fakeEmail("webhooktrail", "developer");
  try {
    await page.goto(`${ctx.base}/signup`);
    await page.locator("#name").fill("Checkout Robot");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(`pw-${Date.now()}-checkout-e2e`);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your inbox").first().waitFor({ timeout: 30_000 });
    await page.goto(await mailLink(ctx, email, "verify-email"));
    await page.getByText(/Email confirmed/).first().waitFor({ timeout: 30_000 });
    f.check("sign-up and email verification", true);
    await page.goto(`${ctx.base}/account/billing`);
    f.check("new account starts on Free", /Free plan/.test(await page.locator("#b-current").innerText()));
    await page.getByRole("button", { name: /Upgrade to Developer/ }).first().click();
    await payOnStripe(ctx, page, f, { amountText: "$9.00", shot: "plan" });
    const customer = (await ctx.stripe.customers.list({ email, limit: 1 })).data[0];
    if (customer) ctx.cleanup.customers.add(customer.id);
    f.must("Stripe customer created for the workspace", !!customer);
    const sent = await deliverEvents(ctx, customer!.id);
    if (sent.length) console.log("  replayed:", sent.join(" "));
    await until(
      "Developer after the webhook",
      async () => {
        await page.goto(`${ctx.base}/account/billing`);
        return /Developer plan/.test(await page.locator("#b-current").innerText());
      },
      90_000,
      3000,
    );
    f.check("subscription webhook activates Developer (Developer plan)", true);
    const sub = (await ctx.stripe.subscriptions.list({ customer: customer!.id, limit: 1 })).data[0];
    if (sub) ctx.cleanup.subscriptions.add(sub.id);
    f.check("Stripe subscription is webhooktrail_developer_monthly $9/month", sub?.items.data[0]?.price.lookup_key === "webhooktrail_developer_monthly" && sub.items.data[0]?.price.unit_amount === 900);
    await page.goto(`${ctx.base}/app`);
    const made = await create(page, ctx.base);
    const l = await list(page, ctx.base);
    const e = l.endpoints?.find((x) => x.id === made.body.id) ?? l.endpoints?.[0];
    f.check("Developer limits apply (2,000 requests, replay included)", e?.maxRequests === 2000 && e.permissions?.replayIncluded === true, JSON.stringify({ status: made.status, max: e?.maxRequests, replay: e?.permissions?.replayIncluded }));
    const log = await webhookLog(ctx);
    f.check(
      "webhooks processed without errors",
      log.some((x) => x.type === "checkout.session.completed" && x.outcome === "processed") && log.every((x) => x.outcome !== "failed" && x.outcome !== "unknown_price"),
      log.map((x) => `${x.type}=${x.outcome}`).join(", "),
    );
    await page.screenshot({ path: `${ctx.outDir}/plan-active.png`, fullPage: true });
  } catch (e) {
    Object.assign(e as object, { flow: f });
    throw e;
  } finally {
    await page.screenshot({ path: `${ctx.outDir}/plan-last.png`, fullPage: true }).catch(() => undefined);
    await context.close();
  }
  return f;
}
