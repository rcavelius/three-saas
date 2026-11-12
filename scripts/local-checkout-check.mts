/**
 * Stripe TEST-mode checkout lifecycle against a LOCAL production build of ChangeKite or WebhookTrail:
 * sign up → verification email → log in via the link → Stripe Checkout (test card 4242) → paid plan active →
 * billing portal opens (product-specific) → cancel → back to Free → account deleted.
 * Emails are caught by a local relay endpoint (the app's EMAIL_RELAY_URL), Stripe events are forwarded to
 * the local webhook and signed with the local STRIPE_WEBHOOK_SECRET (what `stripe listen` does).
 *   STRIPE_SECRET_KEY=sk_test_... LOCAL_WEBHOOK_SECRET=whsec_... npx tsx scripts/local-checkout-check.mts <changekite|webhooktrail> <port> <outDir>
 * The app must run with EMAIL_RELAY_URL=http://127.0.0.1:3999/mail EMAIL_RELAY_SECRET=local-relay-secret-0123456789 RUN_SCHEDULER=1.
 */
import { chromium, type Page } from "@playwright/test";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";

const [app, port, outDir = "checkout-check"] = process.argv.slice(2) as ["changekite" | "webhooktrail", string, string];
const CFG = {
  changekite: { plan: "Solo", deleteSelector: "#delete-password", confirmBox: 'input[name="confirm"]', current: (t: string, p: string) => new RegExp(`Current plan\\s+${p}`, "i").test(t) },
  webhooktrail: { plan: "Developer", deleteSelector: "", confirmBox: "", current: (t: string, p: string) => new RegExp(`${p} plan`, "i").test(t) },
}[app];
if (!CFG) throw new Error("app must be changekite or webhooktrail");
const BASE = `http://localhost:${port}`;
mkdirSync(outDir, { recursive: true });
const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) throw new Error("Refusing: not a Stripe TEST key");
const stripe = new Stripe(key);
const whsec = process.env.LOCAL_WEBHOOK_SECRET!;
const started = Math.floor(Date.now() / 1000) - 5;
const email = `checkout-${app}-${Date.now()}@example.com`;
const password = randomBytes(12).toString("base64url");
const results: [string, boolean, string][] = [];
const ok = (n: string, pass: boolean, d = "") => (results.push([n, pass, d]), console.log(`${pass ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`));

// Local mail catcher (the app's relay target).
const mails: { to: string; subject: string; text: string }[] = [];
const catcher = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    try {
      mails.push(JSON.parse(b));
    } catch {}
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `local-${mails.length}` }));
  });
}).listen(3999, "127.0.0.1");

const forwarded = new Set<string>();
let customerId = "";
async function forward() {
  await new Promise((r) => setTimeout(r, 2500));
  const types: string[] = [];
  for (const e of (await stripe.events.list({ created: { gte: started }, limit: 100 })).data.reverse()) {
    if (forwarded.has(e.id) || !customerId || !JSON.stringify(e.data.object).includes(customerId)) continue;
    const payload = JSON.stringify(e);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", whsec).update(`${t}.${payload}`).digest("hex");
    const r = await fetch(`${BASE}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` }, body: payload });
    forwarded.add(e.id);
    types.push(`${e.type}:${r.status}`);
  }
  return types;
}
async function billingText(page: Page) {
  await page.goto(`${BASE}/account/billing`);
  return page.locator("main").innerText();
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto(`${BASE}/signup`);
  await page.locator("#name").fill("Checkout Tester");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your inbox").waitFor({ timeout: 20_000 });
  let link: string | undefined;
  for (let i = 0; i < 90 && !link; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    link = mails.filter((m) => m.to === email).map((m) => m.text.match(/https?:\/\/\S*verify-email\S*/)?.[0]).find(Boolean);
  }
  ok("verification email sent", Boolean(link));
  await page.goto(link!);
  await page.getByText(/Email confirmed/).first().waitFor({ timeout: 20_000 });
  ok("verification link confirms and signs in", true);

  await page.goto(`${BASE}/account/billing`);
  await page.getByRole("button", { name: new RegExp(`Upgrade to ${CFG.plan}`) }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const merchant = (await page.locator("body").innerText()).match(/Subscribe to ([^\n]+)/)?.[1] ?? "";
  ok("checkout opens on Stripe (test mode)", true, merchant);
  const card = page.locator("#cardNumber");
  if (!(await card.isVisible().catch(() => false))) {
    const radio = page.getByRole("radio", { name: /^Card/ });
    if (await radio.count()) await radio.first().check({ force: true }).catch(() => undefined);
    if (!(await card.isVisible().catch(() => false))) {
      const choice = page.locator('[data-testid="card-accordion-item-button"], #payment-method-accordion-item-title-card').first();
      if (await choice.count()) await choice.click({ force: true }).catch(() => undefined);
    }
    if (!(await card.isVisible().catch(() => false))) await page.getByText("Card", { exact: true }).first().click({ force: true });
  }
  await card.waitFor({ timeout: 30_000 });
  await card.fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  if (await page.locator("#billingName").count()) await page.locator("#billingName").fill("Checkout Tester");
  if (await page.locator("#billingCountry").count()) await page.locator("#billingCountry").selectOption("US").catch(() => undefined);
  if (await page.locator("#billingPostalCode").count()) await page.locator("#billingPostalCode").fill("10001").catch(() => undefined);
  const linkBox = page.getByRole("checkbox", { name: /Save my information/ });
  if ((await linkBox.count()) && (await linkBox.isChecked())) await linkBox.uncheck({ force: true });
  await page.screenshot({ path: join(outDir, `${app}-checkout.png`) });
  await page.locator('[data-testid="hosted-payment-submit-button"], button.SubmitButton').first().click();
  await page.waitForURL(new RegExp(`^${BASE}`), { timeout: 60_000 });
  ok("test payment succeeds and returns to the app", true, page.url().replace(BASE, ""));
  customerId = (await stripe.customers.list({ email, limit: 1 })).data[0]?.id ?? "";
  console.log("  forwarded:", (await forward()).join(" "));
  ok(`${CFG.plan} plan active after payment`, CFG.current(await billingText(page), CFG.plan));
  await page.screenshot({ path: join(outDir, `${app}-paid.png`), fullPage: true });

  await page.getByRole("button", { name: /Manage subscription/ }).click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.getByText(/subscription|plan/i).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const portalText = await page.locator("body").innerText();
  ok("billing portal opens", true, new URL(page.url()).host);
  ok("portal is product-specific (no other product's plans)", !/GridRinse|ChangeKite|WebhookTrail/.test(portalText.replace(new RegExp(app === "changekite" ? "ChangeKite" : "WebhookTrail", "g"), "")));
  await page.screenshot({ path: join(outDir, `${app}-portal.png`), fullPage: true });

  const sub = (await stripe.subscriptions.list({ customer: customerId, limit: 1 })).data[0]!;
  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  console.log("  forwarded:", (await forward()).join(" "));
  ok("cancel at period end shown", /cancel/i.test(await billingText(page)));
  await stripe.subscriptions.cancel(sub.id);
  console.log("  forwarded:", (await forward()).join(" "));
  ok("immediate cancel returns to Free", CFG.current(await billingText(page), "Free"));
  const tags = mails.filter((m) => m.to === email).map((m) => m.subject);
  console.log("  emails to the customer:", JSON.stringify(tags));

  await page.goto(`${BASE}/account`);
  if (CFG.deleteSelector) {
    await page.locator(CFG.deleteSelector).fill(password);
    await page.locator(CFG.confirmBox).check();
    await page.getByRole("button", { name: "Delete my account" }).click();
  } else {
    await page.getByRole("button", { name: /Delete (my )?account/ }).first().click();
    const pw = page.getByLabel(/password/i).last();
    if (await pw.count()) await pw.fill(password);
    await page.getByRole("button", { name: /Delete everything permanently|Yes, delete|Delete permanently/ }).last().click();
  }
  await page.waitForURL(/deleted|\/$/, { timeout: 20_000 });
  ok("account deletion", true);
} catch (e) {
  ok("unexpected error", false, (e as Error).message.slice(0, 300));
  await page.screenshot({ path: join(outDir, `${app}-error.png`), fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  catcher.close();
  if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
}
const failed = results.filter((r) => !r[1]);
console.log(failed.length ? `\n${failed.length} FAILED` : `\nALL ${results.length} PASSED`);
process.exit(failed.length ? 1 : 0);
