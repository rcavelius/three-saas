/**
 * Production smoke test: sign up → verification link (from DEV_MAIL_DIR) → log in → tool → billing
 * (no Stripe key: graceful message) → delete account. Console must show no CSP violations; axe finds
 * no serious/critical issues; pages fit a 390 px phone screen.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Netlify injects its own toolbar script into hosted pages; our CSP blocks it (as intended), so its report is ignored. */
const HOST_INJECTED = /\/\.netlify\/scripts\/hud/;

const MAIL_DIR = fileURLToPath(new URL("../.data/e2e-mail", import.meta.url));
const EMAIL = `smoke-${Date.now()}@example.com`;
const PASSWORD = "smoke test password 123";

function latestLink(to: string, tag: string): string {
  const safe = to.replace(/[^a-z0-9@._-]/gi, "_");
  const files = readdirSync(MAIL_DIR)
    .filter((f) => f.includes(tag) && f.endsWith(`${safe}.txt`))
    .sort();
  const text = readFileSync(`${MAIL_DIR}/${files.at(-1)}`, "utf8");
  const m = text.match(/https?:\/\/\S+/);
  if (!m) throw new Error("no link");
  return m[0];
}

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("public pages: no CSP violations, accessible, fit 390 px", async ({ page }) => {
  const problems = watchConsole(page);
  for (const path of ["/", "/pricing", "/signup", "/login", "/guides", "/privacy"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await axe(page, path);
  }
  // The tool itself, with a file loaded
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await expect(page.locator('p.sr-only[role="status"]')).toContainText(/Cleaned:/, { timeout: 30_000 });
  await axe(page, "/ (tool loaded)");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/pricing", "/signup", "/account/billing"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows at 390px`).toBeLessThanOrEqual(0);
  }
  expect(problems.filter((p) => !HOST_INJECTED.test(p))).toEqual([]);
});

test("sign up → verify → log in → tool → billing → delete account", async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto("/signup?plan=pro");
  await page.getByLabel("Name").fill("Smoke Tester");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Verification link from the outbox (DEV_MAIL_DIR copy).
  await expect.poll(() => readdirSync(MAIL_DIR).some((f) => f.includes("verify-email")), { timeout: 10_000 }).toBe(true);
  await page.goto(latestLink(EMAIL, "auth.verify-email"));
  await expect(page.getByRole("heading", { name: "Your email is confirmed" })).toBeVisible();
  // Signed-up-for-Pro path continues to checkout; without Stripe keys that is a clear message.
  await page.getByRole("button", { name: /Continue to checkout for Pro/ }).click();
  await expect(page.getByText(/Payments are not switched on yet/)).toBeVisible();

  // Sign out, then log in through the form.
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/");
  await page.goto("/login?next=/account");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/account");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await axe(page, "/account");

  // The tool, signed in: limits come from the server (Free).
  await page.goto("/");
  await expect(page.getByText(/Free plan: up to 3 files/)).toBeVisible();
  await page.getByRole("button", { name: "Try a sample file" }).click();
  await expect(page.locator('p.sr-only[role="status"]')).toContainText(/Cleaned:/, { timeout: 30_000 });
  await expect(page.getByText(/keeps workflows in this browser only/)).toBeVisible();

  // Billing page without Stripe keys.
  await page.goto("/account/billing");
  await expect(page.getByRole("heading", { name: "Current plan: Free" })).toBeVisible();
  await expect(page.getByText(/Payments are not switched on for this site yet/)).toBeVisible();
  await page.getByRole("button", { name: /Upgrade to Pro/ }).click();
  await expect(page.getByText(/Payments are not switched on yet\. Your plan stays/)).toBeVisible();
  await axe(page, "/account/billing");

  await page.goto("/account/team");
  await expect(page.getByText(/Team members are part of the Business plan/)).toBeVisible();
  await axe(page, "/account/team");

  // Admin is a 404 for customers.
  const admin = await page.goto("/admin");
  expect(admin!.status()).toBe(404);

  // Delete the account.
  await page.goto("/account");
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("checkbox", { name: /permanently deletes/ }).check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("**/?account=deleted");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=/);
  const relogin = await page.request.post("/api/auth/sign-in/email", { data: { email: EMAIL, password: PASSWORD }, headers: { origin: "http://localhost:3102" } });
  expect(relogin.status()).toBe(401);

  expect(problems.filter((p) => !/status of (401|403|404|503)/.test(p) && !HOST_INJECTED.test(p))).toEqual([]);
});
