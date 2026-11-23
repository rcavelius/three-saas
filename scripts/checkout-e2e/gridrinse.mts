/**
 * GridRinse: free download limit → paywall → 24-hour pass ($5) on Stripe test Checkout → webhook → pass cookie and
 * unlock link → unlimited downloads; and the Pro monthly plan ($9) from sign-up to "Current plan: Pro".
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

/** 1,500 messy rows: over the free download allowance (1,000 rows). */
function messyCsv(rows = 1500): Buffer {
  const lines = ["id,name,amount,joined"];
  for (let i = 1; i <= rows; i++) lines.push(`${i},  Customer ${i}  ,"$${i},000.50",Jan ${(i % 28) + 1}, 2024`.replace(/,Jan (\d+), 2024$/, ',"Jan $1, 2024"'));
  return Buffer.from(lines.join("\r\n") + "\r\n", "utf8");
}

async function entitlements(page: Page, base: string) {
  const r = await page.request.get(`${base}/api/me/entitlements`);
  return (await r.json()) as {
    planId: string;
    limits: Record<string, number>;
    pass: { name: string; expiresAt: string; unlockUrl: string } | null;
  };
}

async function loadFile(page: Page) {
  await page.locator("#file-input").setInputFiles({ name: "customers.csv", mimeType: "text/csv", buffer: messyCsv() });
  await page.locator('p.sr-only[role="status"]').filter({ hasText: /Cleaned:/ }).waitFor({ timeout: 60_000 });
}

async function tryDownload(page: Page): Promise<"downloaded" | "paywall"> {
  const btn = page.getByRole("button", { name: "Download cleaned CSV", exact: true });
  await btn.waitFor({ timeout: 30_000 });
  await until("download button enabled", async () => btn.isEnabled(), 30_000, 300);
  const dl = page.waitForEvent("download", { timeout: 20_000 }).then(() => "downloaded" as const);
  const wall = page
    .locator("#paywall-heading")
    .waitFor({ timeout: 20_000 })
    .then(() => "paywall" as const);
  await btn.click();
  return Promise.race([dl, wall]);
}

export async function passFlow(ctx: Ctx, browser: Browser): Promise<Flow> {
  const f = new Flow("gridrinse 24-hour pass $5");
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${ctx.base}/`);
    const before = await entitlements(page, ctx.base);
    f.must("anonymous visitor is on Free (1,000-row downloads)", before.planId === "free" && before.limits.downloadRows === 1000 && !before.pass, JSON.stringify(before.limits));
    await loadFile(page);
    f.check("1,500-row file cleaned in the browser", true);
    f.must("free download limit hit: paywall shows instead of downloading", (await tryDownload(page)) === "paywall");
    const heading = await page.locator("#paywall-heading").innerText();
    f.check("paywall says the file is ready with its row count", /1,500 rows/.test(heading), heading);
    const buy = page.getByRole("button", { name: /Download with a 24-hour pass — \$5/ });
    f.must("paywall offers the 24-hour pass for $5", (await buy.count()) === 1);
    await page.screenshot({ path: `${ctx.outDir}/pass-paywall.png` });

    const claim = await holdClaimUntilWebhook(ctx, page, f);
    await buy.click();
    await payOnStripe(ctx, page, f, { amountText: "$5.00", shot: "pass" });
    await page.waitForLoadState("load");
    const sessionId = claim.sessionId();
    const session = await rememberSessionCustomer(ctx, sessionId);
    f.check(
      "Stripe session: paid, payment mode, gridrinse_day_pass $5",
      session?.payment_status === "paid" && session.mode === "payment" && session.line_items?.data[0]?.price?.lookup_key === "gridrinse_day_pass" && session.amount_total === 500,
      `${session?.payment_status} ${session?.amount_total}`,
    );
    f.check("claim redirects back to the page the visitor paid from (?pass=active)", /[?&]pass=active/.test(page.url()) || (await page.getByText(/Downloads are unlocked in this browser/).count()) > 0, page.url().replace(ctx.base, ""));
    const cookie = await passCookie(context, ctx.base);
    f.must("signed pass cookie set (HttpOnly, SameSite=Lax)", !!cookie && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.value.startsWith(sessionId + "."), cookie?.name ?? "none");
    const row = (await q<{ pass_id: string; expires_at: Date; amount_cents: number }>(ctx, `SELECT pass_id, expires_at, amount_cents FROM billing_passes WHERE id = $1`, [sessionId]))[0];
    const hours = row ? (new Date(row.expires_at).getTime() - Date.now()) / 3_600_000 : 0;
    f.check("pass recorded for 24 hours", !!row && row.pass_id === "day" && hours > 23.5 && hours <= 24.1, `${hours.toFixed(2)} h`);

    const after = await entitlements(page, ctx.base);
    f.check("pass raises limits to Pro processing (unlimited downloads, 50 MB, 500k rows)", after.limits.downloadRows === -1 && after.limits.downloadsPerDay === -1 && after.limits.maxFileMb === 50 && after.limits.maxRows === 500_000, JSON.stringify(after.limits));
    f.must("entitlements report the active 24-hour pass", after.pass?.name === "24-hour pass", JSON.stringify(after.pass));

    // Work is restored from this browser, or the visitor drops the file again; either way the download now goes through.
    if (!(await page.getByRole("button", { name: "Download cleaned CSV", exact: true }).count())) await loadFile(page);
    f.check("download goes through with the pass (over 1,000 rows)", (await tryDownload(page)) === "downloaded");
    f.check("second download the same day also works", (await tryDownload(page)) === "downloaded");
    const link = await page.locator("#pass-unlock-link").inputValue().catch(() => "");
    f.check("unlock link is shown to the buyer", link === after.pass!.unlockUrl, link ? "shown" : "missing");
    await page.screenshot({ path: `${ctx.outDir}/pass-active.png`, fullPage: true });

    // A forged cookie unlocks nothing.
    const forged = await browser.newContext();
    await forged.addCookies([{ ...cookie!, value: `${sessionId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` }]);
    const fp = await forged.newPage();
    const fe = await entitlements(fp, ctx.base);
    f.check("forged pass cookie is ignored (Free)", fe.planId === "free" && fe.limits.downloadRows === 1000 && !fe.pass);
    await forged.close();

    // The unlock link on another device.
    const other = await browser.newContext({ acceptDownloads: true });
    const op = await other.newPage();
    await op.goto(after.pass!.unlockUrl);
    f.check("unlock link on a new device lands on the site with ?pass=active", /[?&]pass=active/.test(op.url()), op.url().replace(ctx.base, ""));
    const oe = await entitlements(op, ctx.base);
    f.check("unlock link sets the pass on the new device", oe.pass?.name === "24-hour pass" && oe.limits.downloadRows === -1);
    await op.goto(`${ctx.base}/`);
    await loadFile(op);
    f.check("new device downloads over the free limit", (await tryDownload(op)) === "downloaded");
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
  const f = new Flow("gridrinse Pro monthly $9");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const email = fakeEmail("gridrinse", "pro");
  try {
    await page.goto(`${ctx.base}/signup?plan=pro`);
    await page.getByLabel("Name").fill("Checkout Robot");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`pw-${Date.now()}-checkout-e2e`);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("heading", { name: "Check your email" }).waitFor({ timeout: 30_000 });
    const verify = await mailLink(ctx, email, "verify-email");
    await page.goto(verify);
    await page.getByRole("heading", { name: "Your email is confirmed" }).waitFor({ timeout: 30_000 });
    f.check("sign-up and email verification", true);
    await page.goto(`${ctx.base}/account/billing`);
    await page.getByRole("heading", { name: "Current plan: Free" }).waitFor({ timeout: 30_000 });
    f.check("new account starts on Free", true);
    await page.goto(verify).catch(() => undefined);
    const cont = page.getByRole("button", { name: /Continue to checkout for Pro/ });
    if (await cont.count()) await cont.click();
    else {
      await page.goto(`${ctx.base}/account/billing`);
      await page.getByRole("button", { name: /Upgrade to Pro/ }).first().click();
    }
    await payOnStripe(ctx, page, f, { amountText: "$9.00", shot: "plan" });
    const customer = (await ctx.stripe.customers.list({ email, limit: 1 })).data[0];
    if (customer) ctx.cleanup.customers.add(customer.id);
    f.must("Stripe customer created for the workspace", !!customer);
    const sent = await deliverEvents(ctx, customer!.id);
    if (sent.length) console.log("  replayed:", sent.join(" "));
    await until(
      "Pro after the webhook",
      async () => {
        await page.goto(`${ctx.base}/account/billing`);
        return (await page.getByRole("heading", { name: "Current plan: Pro" }).count()) > 0;
      },
      90_000,
      3000,
    );
    f.check("subscription webhook activates Pro (Current plan: Pro)", true);
    const sub = (await ctx.stripe.subscriptions.list({ customer: customer!.id, limit: 1 })).data[0];
    if (sub) ctx.cleanup.subscriptions.add(sub.id);
    f.check("Stripe subscription is gridrinse_pro_monthly $9/month", sub?.items.data[0]?.price.lookup_key === "gridrinse_pro_monthly" && sub.items.data[0]?.price.unit_amount === 900);
    const ent = await entitlements(page, ctx.base);
    f.check("Pro limits apply (unlimited downloads, 50 MB, 50 saved workflows)", ent.planId === "pro" && ent.limits.downloadRows === -1 && ent.limits.maxFileMb === 50 && ent.limits.savedWorkflows === 50, JSON.stringify(ent.limits));
    const log = await webhookLog(ctx);
    f.check(
      "webhooks processed without errors",
      log.some((e) => e.type === "checkout.session.completed" && e.outcome === "processed") && log.every((e) => e.outcome !== "failed" && e.outcome !== "unknown_price"),
      log.map((e) => `${e.type}=${e.outcome}`).join(", "),
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
