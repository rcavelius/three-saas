/**
 * Full Stripe TEST-mode customer lifecycle against a LOCAL GridRinse production build (localhost:3102):
 * sign up → verify email → Stripe Checkout (test card 4242) → Pro → billing portal opens → upgrade to
 * Business → downgrade to Pro → failed renewal payment → cancel at period end → cancel → Free → delete account.
 * Stripe cannot reach localhost, so real Stripe test events are forwarded to the local webhook endpoint
 * and signed with the local server's STRIPE_WEBHOOK_SECRET (what `stripe listen` does).
 *   STRIPE_SECRET_KEY=sk_test_... LOCAL_WEBHOOK_SECRET=whsec_... npx tsx scripts/local-stripe-lifecycle.mts <mailDir> <outDir>
 */
import { chromium, type Page } from "@playwright/test";
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Stripe from "stripe";

const BASE = "http://localhost:3102";
const [mailDir, outDir = "lifecycle"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) throw new Error("Refusing: not a Stripe TEST key");
const whsec = process.env.LOCAL_WEBHOOK_SECRET!;
const stripe = new Stripe(key);
const started = Math.floor(Date.now() / 1000) - 5;
const email = `lifecycle-${Date.now()}@example.com`;
const password = randomBytes(12).toString("base64url");
const results: [string, boolean, string][] = [];
const ok = (name: string, pass: boolean, detail = "") => {
  results.push([name, pass, detail]);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const forwarded = new Set<string>();
let customerId = "";
async function forward(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 2500));
  const types: string[] = [];
  const evts = (await stripe.events.list({ created: { gte: started }, limit: 100 })).data.reverse();
  for (const e of evts) {
    if (forwarded.has(e.id) || !customerId || !JSON.stringify(e.data.object).includes(customerId)) continue;
    const payload = JSON.stringify(e);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", whsec).update(`${t}.${payload}`).digest("hex");
    const res = await fetch(`${BASE}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` },
      body: payload,
    });
    forwarded.add(e.id);
    types.push(`${e.type}:${res.status}`);
  }
  return types;
}
async function planHeading(page: Page): Promise<string> {
  await page.goto(`${BASE}/account/billing`);
  return (await page.getByRole("heading", { name: /Current plan:/ }).textContent())?.trim() ?? "";
}
function latestMail(tag: string): string | null {
  const safe = email.replace(/[^a-z0-9@._-]/gi, "_");
  const f = readdirSync(mailDir).filter((x) => x.includes(tag) && x.endsWith(`${safe}.txt`)).sort().at(-1);
  return f ? readFileSync(join(mailDir, f), "utf8") : null;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  // 1. Sign up for Pro, verify email.
  await page.goto(`${BASE}/signup?plan=pro`);
  await page.getByLabel("Name").fill("Lifecycle Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Check your email" }).waitFor();
  let verify: string | null = null;
  for (let i = 0; i < 20 && !verify; i++) {
    await new Promise((r) => setTimeout(r, 500));
    verify = latestMail("verify-email");
  }
  ok("signup sends verification email", Boolean(verify));
  await page.goto(verify!.match(/https?:\/\/\S+/)![0]);
  await page.getByRole("heading", { name: "Your email is confirmed" }).waitFor();
  ok("email verification link confirms account", true);

  // 2. Checkout on Stripe's hosted test page.
  await page.getByRole("button", { name: /Continue to checkout for Pro/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  ok("checkout redirects to Stripe (test mode)", true, new URL(page.url()).host);
  const card = page.locator("#cardNumber");
  const cardChoice = page.locator('[data-testid="card-accordion-item-button"], input[value="card"], #payment-method-accordion-item-title-card').first();
  if (!(await card.isVisible().catch(() => false))) {
    const radio = page.getByRole("radio", { name: /^Card/ });
    if (await radio.count()) await radio.first().check({ force: true });
    else if (await cardChoice.count()) await cardChoice.click({ force: true });
    else await page.getByText("Card", { exact: true }).first().click();
  }
  await card.waitFor({ timeout: 30_000 });
  await card.fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  const nameField = page.locator("#billingName");
  if (await nameField.count()) await nameField.fill("Lifecycle Tester");
  const country = page.locator("#billingCountry");
  if (await country.count()) await country.selectOption("US").catch(() => undefined);
  const zip = page.locator("#billingPostalCode");
  if (await zip.count()) await zip.fill("10001").catch(() => undefined);
  const link = page.getByRole("checkbox", { name: /Save my information/ });
  if ((await link.count()) && (await link.isChecked())) await link.uncheck({ force: true });
  await page.screenshot({ path: join(outDir, "1-checkout.png") });
  await page.locator('[data-testid="hosted-payment-submit-button"], button.SubmitButton').first().click();
  await page.waitForURL(new RegExp(`^${BASE}`), { timeout: 60_000 });
  ok("test payment succeeds and returns to the app", true, page.url().replace(BASE, ""));
  const cust = await stripe.customers.list({ email, limit: 1 });
  customerId = cust.data[0]?.id ?? "";
  ok("Stripe customer created by the app", Boolean(customerId), customerId);
  console.log("  forwarded:", (await forward()).join(" "));
  ok("subscription activates Pro entitlement", /Pro/.test(await planHeading(page)), await planHeading(page));
  await page.screenshot({ path: join(outDir, "2-pro.png"), fullPage: true });

  // 3. Billing portal opens.
  await page.getByRole("button", { name: /Manage billing/ }).click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 30_000 });
  ok("customer billing portal opens (Stripe test)", true, new URL(page.url()).host);
  await page.screenshot({ path: join(outDir, "3-portal.png") });

  // 4. Upgrade and downgrade (what the portal's plan switch does).
  const prices = await stripe.prices.list({ lookup_keys: ["gridrinse_pro_monthly", "gridrinse_business_monthly"], active: true });
  const price = (lk: string) => prices.data.find((p) => p.lookup_key === lk)!.id;
  let sub = (await stripe.subscriptions.list({ customer: customerId, limit: 1 })).data[0]!;
  sub = await stripe.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0]!.id, price: price("gridrinse_business_monthly") }], proration_behavior: "create_prorations" });
  console.log("  forwarded:", (await forward()).join(" "));
  ok("upgrade to Business updates entitlement", /Business/.test(await planHeading(page)), await planHeading(page));
  sub = await stripe.subscriptions.update(sub.id, { items: [{ id: sub.items.data[0]!.id, price: price("gridrinse_pro_monthly") }], proration_behavior: "create_prorations" });
  console.log("  forwarded:", (await forward()).join(" "));
  ok("downgrade to Pro updates entitlement", /Pro/.test(await planHeading(page)), await planHeading(page));

  // 5. Failed payment: switch to a declining test card and bill an invoice.
  const failPm = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: failPm.id } });
  await stripe.subscriptions.update(sub.id, { default_payment_method: failPm.id });
  await stripe.invoiceItems.create({ customer: customerId, amount: 500, currency: "usd", description: "lifecycle drill charge" });
  const inv = await stripe.invoices.create({ customer: customerId, subscription: sub.id, auto_advance: false });
  await stripe.invoices.finalizeInvoice(inv.id!);
  const paid = await stripe.invoices.pay(inv.id!).then(() => "paid").catch((e) => `declined (${(e as Stripe.errors.StripeError).code})`);
  console.log("  forwarded:", (await forward()).join(" "));
  await page.goto(`${BASE}/account/billing`);
  const billingText = await page.locator("main").innerText();
  ok("failed payment is shown to the customer", /payment (failed|did not go through)|until the payment succeeds|update your card/i.test(billingText), paid);
  for (let i = 0; i < 10 && !latestMail("payment_failed"); i++) await new Promise((r) => setTimeout(r, 1000));
  ok("failed-payment email queued", Boolean(latestMail("payment_failed")));
  ok("plan-change emails queued (upgrade/downgrade)", Boolean(latestMail("plan_changed")));
  await page.screenshot({ path: join(outDir, "4-payment-failed.png"), fullPage: true });

  // 6. Cancel at period end, then cancel now.
  await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  console.log("  forwarded:", (await forward()).join(" "));
  await page.goto(`${BASE}/account/billing`);
  ok("cancel at period end is shown", /is canceled and ends on/.test(await page.locator("main").innerText()));
  await stripe.subscriptions.cancel(sub.id);
  console.log("  forwarded:", (await forward()).join(" "));
  ok("immediate cancel returns workspace to Free", /Free/.test(await planHeading(page)), await planHeading(page));
  for (let i = 0; i < 10 && !latestMail("subscription_canceled"); i++) await new Promise((r) => setTimeout(r, 1000));
  ok("cancellation email queued", Boolean(latestMail("subscription_canceled")));

  // 7. Delete the account.
  await page.goto(`${BASE}/account`);
  await page.getByLabel("Your password").fill(password);
  await page.getByRole("checkbox", { name: /permanently deletes/ }).check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("**/?account=deleted");
  ok("account deletion", true);
} catch (e) {
  ok("unexpected error", false, (e as Error).message.slice(0, 300));
  await page.screenshot({ path: join(outDir, "error.png"), fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
  if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
}
const failed = results.filter((r) => !r[1]);
console.log(failed.length ? `\n${failed.length} FAILED` : `\nALL ${results.length} PASSED`);
process.exit(failed.length ? 1 : 0);
