/**
 * ChangeKite: free scan → report limited to the top 3 issues → paywall → full-report pass ($9) on Stripe test
 * Checkout → webhook → ck_pass cookie and unlock link → full issue list + PDF; and the Solo monthly plan ($19).
 */
import { randomBytes } from "node:crypto";
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

const howToFixCount = (page: Page) => page.getByText("How to fix", { exact: true }).count();

/** Runs a real anonymous scan of example.com and returns the report id. */
async function scan(page: Page, base: string): Promise<string> {
  await page.goto(`${base}/`);
  await page.getByLabel("Website address").first().fill("example.com");
  await page.getByRole("button", { name: "Scan free" }).first().click();
  const a = page.locator('a[href^="/report/"]').first();
  await a.waitFor({ timeout: 120_000 });
  return (await a.getAttribute("href"))!.split("/report/")[1]!.split(/[?#]/)[0]!;
}

/**
 * A real scan of a tiny site can have 3 issues or fewer, and then nothing is locked. In that case the test stores
 * a copy of the real report with extra issues (anonymous, like any free scan) so the paywall path is always tested.
 */
async function reportWithLockedIssues(ctx: Ctx, id: string): Promise<{ id: string; total: number; seeded: boolean }> {
  const row = (await q<{ report: { issues: { id: string; check: string; severity: string; page: string | null; message: string; howToFix: string }[]; counts: Record<string, number> } }>(ctx, `SELECT report FROM scans WHERE id = $1`, [id]))[0]!;
  const report = typeof row.report === "string" ? JSON.parse(row.report) : row.report;
  if (report.issues.length > 3) return { id, total: report.issues.length, seeded: false };
  const base = report.issues[0] ?? { id: "description-missing", check: "meta", severity: "warning", page: null, message: "Missing meta description", howToFix: "Add a meta description." };
  const had = report.issues.length;
  for (let i = had; i < 8; i++) {
    report.issues.push({ ...base, id: `${base.id}`, severity: "notice", page: `${report.origin ?? "https://example.com"}/checkout-e2e-${i}`, message: `${base.message} (test page ${i})` });
  }
  report.counts.notice = (report.counts.notice ?? 0) + (8 - had);
  const newId = randomBytes(16).toString("base64url");
  await ctx.db.query(
    `INSERT INTO scans (id, url, host, score, critical, warning, notice, pages, duration_ms, report, created_at, expires_at, org_id, site_id, home_status, reachable, fingerprints)
     SELECT $2, url, host, score, critical, warning, $3, pages, duration_ms, $4::jsonb, created_at, expires_at, NULL, NULL, home_status, reachable, NULL FROM scans WHERE id = $1`,
    [id, newId, report.counts.notice, JSON.stringify(report)],
  );
  return { id: newId, total: report.issues.length, seeded: true };
}

export async function passFlow(ctx: Ctx, browser: Browser): Promise<Flow> {
  const f = new Flow("changekite full-report pass $9");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ctx.base });
  const page = await context.newPage();
  try {
    const scanned = await scan(page, ctx.base);
    f.check("anonymous scan of example.com produced a report", true);
    const rep = await reportWithLockedIssues(ctx, scanned);
    f.check(rep.seeded ? "report has more than 3 issues (real scan had 3 or fewer: seeded a copy with 8)" : "real report has more than 3 issues", true, `${rep.total} issues`);
    await page.goto(`${ctx.base}/report/${rep.id}`);
    await page.getByText("Full report locked").first().waitFor({ timeout: 20_000 });
    f.check("free limit: report shows the top 3 issues only", (await howToFixCount(page)) === 3, `${await howToFixCount(page)} "How to fix"`);
    f.check("paywall shows (Full report locked)", true);
    const buy = page.getByRole("button", { name: /Unlock the full report — \$9/ }).first();
    f.must("paywall offers the full report for $9", (await buy.count()) > 0);
    f.check("PDF is not offered on the free report", (await page.getByRole("link", { name: /Download PDF/ }).count()) === 0);
    await page.screenshot({ path: `${ctx.outDir}/pass-paywall.png`, fullPage: true });

    const claim = await holdClaimUntilWebhook(ctx, page, f);
    await buy.click();
    await payOnStripe(ctx, page, f, { amountText: "$9.00", shot: "pass" });
    await page.waitForLoadState("load");
    const sessionId = claim.sessionId();
    const session = await rememberSessionCustomer(ctx, sessionId);
    f.check(
      "Stripe session: paid, payment mode, changekite_report_pass $9",
      session?.payment_status === "paid" && session.mode === "payment" && session.line_items?.data[0]?.price?.lookup_key === "changekite_report_pass" && session.amount_total === 900,
      `${session?.payment_status} ${session?.amount_total}`,
    );
    f.check("claim returns to the same report", page.url().startsWith(`${ctx.base}/report/${rep.id}`), page.url().replace(ctx.base, ""));
    await page.getByText(/Pass active until/).first().waitFor({ timeout: 15_000 }).then(
      () => f.check("page confirms the pass (Pass active until …)", true),
      () => f.check("page confirms the pass (Pass active until …)", false),
    );
    const cookie = await passCookie(context, ctx.base);
    f.must("signed pass cookie ck_pass set (HttpOnly, SameSite=Lax)", cookie?.name === "ck_pass" && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.value.startsWith(sessionId + "."), cookie?.name ?? "none");
    const row = (await q<{ pass_id: string; expires_at: Date }>(ctx, `SELECT pass_id, expires_at FROM billing_passes WHERE id = $1`, [sessionId]))[0];
    const days = row ? (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000 : 0;
    f.check("pass recorded for 7 days", !!row && row.pass_id === "report" && days > 6.95 && days <= 7.01, `${days.toFixed(3)} d`);

    await page.goto(`${ctx.base}/report/${rep.id}`);
    const unlocked = await howToFixCount(page);
    f.check("full report: every issue with its fix", unlocked >= rep.total && (await page.getByText("Full report locked").count()) === 0, `${unlocked} of ${rep.total}`);
    const pdf = page.getByRole("link", { name: /Download PDF/ }).first();
    f.check("PDF download offered with the pass", (await pdf.count()) > 0);
    if (await pdf.count()) {
      const href = (await pdf.getAttribute("href"))!;
      const r = await page.request.get(new URL(href, ctx.base).toString());
      f.check("PDF route serves the full report to the pass holder", r.status() === 200 && (r.headers()["content-type"] ?? "").includes("pdf"), `HTTP ${r.status()}`);
    }
    await page.screenshot({ path: `${ctx.outDir}/pass-active.png`, fullPage: true });

    // Unlock link (clipboard button).
    let unlock = "";
    const copy = page.getByRole("button", { name: /Copy unlock link/ }).first();
    if (await copy.count()) {
      await copy.click();
      unlock = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
    }
    if (unlock && !/^https?:/.test(unlock)) unlock = new URL(unlock, ctx.base).toString();
    f.check("unlock link offered to the buyer", unlock.includes(`/api/billing/pass/claim?session_id=${sessionId}`), unlock ? "copied" : "missing");
    if (!unlock) unlock = `${ctx.base}/api/billing/pass/claim?session_id=${sessionId}&next=${encodeURIComponent(`/report/${rep.id}`)}`;

    // A forged cookie unlocks nothing.
    const forged = await browser.newContext();
    await forged.addCookies([{ ...cookie!, value: `${sessionId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` }]);
    const fp = await forged.newPage();
    await fp.goto(`${ctx.base}/report/${rep.id}`);
    f.check("forged pass cookie: report stays locked", (await fp.getByText("Full report locked").count()) > 0);
    await forged.close();

    const other = await browser.newContext();
    const op = await other.newPage();
    await op.goto(unlock);
    f.check("unlock link on a new device opens the report", op.url().startsWith(`${ctx.base}/report/${rep.id}`), op.url().replace(ctx.base, ""));
    await op.goto(`${ctx.base}/report/${rep.id}`);
    f.check("new device sees the full report", (await howToFixCount(op)) >= rep.total && (await op.getByText("Full report locked").count()) === 0);
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

async function currentPlan(page: Page, base: string): Promise<string> {
  await page.goto(`${base}/account/billing`);
  return page.locator("main").innerText();
}

export async function planFlow(ctx: Ctx, browser: Browser): Promise<Flow> {
  const f = new Flow("changekite Solo monthly $19");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const email = fakeEmail("changekite", "solo");
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
    f.check("new account starts on Free", /Current plan\s+Free/i.test(await currentPlan(page, ctx.base)));
    await page.getByRole("button", { name: /Upgrade to Solo/ }).first().click();
    await payOnStripe(ctx, page, f, { amountText: "$19.00", shot: "plan" });
    const customer = (await ctx.stripe.customers.list({ email, limit: 1 })).data[0];
    if (customer) ctx.cleanup.customers.add(customer.id);
    f.must("Stripe customer created for the workspace", !!customer);
    const sent = await deliverEvents(ctx, customer!.id);
    if (sent.length) console.log("  replayed:", sent.join(" "));
    await until("Solo after the webhook", async () => /Current plan\s+Solo/i.test(await currentPlan(page, ctx.base)), 90_000, 3000);
    f.check("subscription webhook activates Solo (Current plan Solo)", true);
    const sub = (await ctx.stripe.subscriptions.list({ customer: customer!.id, limit: 1 })).data[0];
    if (sub) ctx.cleanup.subscriptions.add(sub.id);
    f.check("Stripe subscription is changekite_solo_monthly $19/month", sub?.items.data[0]?.price.lookup_key === "changekite_solo_monthly" && sub.items.data[0]?.price.unit_amount === 1900);
    // Solo limits: monitored sites allowed (Free has 0).
    const site = await page.evaluate(async (b) => {
      const r = await fetch(`${b}/api/sites`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com" }) });
      return r.status;
    }, ctx.base);
    f.check("Solo limits apply: a monitored site can be added (Free allows none)", site === 200 || site === 201, `HTTP ${site}`);
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
