// Headless release-gate smoke test of a running SiteProof production server (next start). Edge, headless only.
//   node e2e/smoke.mjs <baseUrl> phase1 <stateFile> <email>
//   node e2e/smoke.mjs <baseUrl> phase2 <stateFile> <email> <verifyLink>
// Phase 1: public pages (axe, CSP, 390 px), a real anonymous scan of https://example.com, sign-up.
// Phase 2 (after the runner reads the verification link from the outbox): verify, dashboard, billing without
// Stripe, /admin 404, delete account, login refused. See e2e/run-smoke.sh.
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const [base, phase, stateFile, email, link] = process.argv.slice(2);
const PASSWORD = "smoke-test-password-123";
const report = { phase, checks: [], failures: [], consoleErrors: [], cspViolations: [] };
const ok = (name, cond, detail = "") => {
  report.checks.push({ name, ok: Boolean(cond), detail });
  if (!cond) report.failures.push(`${name} ${detail}`.trim());
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext(phase === "phase2" ? { storageState: stateFile } : {});
const page = await context.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to (execute|load|apply)/i.test(t)) report.cspViolations.push(`${page.url()} :: ${t}`);
  else if (m.type() === "error" && !/status of (401|404|503)/.test(t)) report.consoleErrors.push(`${page.url()} :: ${t}`);
});
page.on("pageerror", (e) => report.consoleErrors.push(`${page.url()} :: pageerror ${e.message}`));

async function axe(label) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`axe ${label}`, bad.length === 0, bad.map((v) => v.id).join(","));
}
async function fits390(path) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`no horizontal scroll at 390px ${path}`, overflow <= 0, `${overflow}px`);
  await page.setViewportSize({ width: 1280, height: 900 });
}

try {
  if (phase === "phase1") {
    for (const path of ["/", "/pricing", "/docs", "/guides", "/bot", "/signup", "/login"]) {
      const r = await page.goto(base + path);
      ok(`${path} 200`, r?.status() === 200, String(r?.status()));
      await axe(path);
    }
    const csp = (await page.goto(base + "/"))?.headers()["content-security-policy"] ?? "";
    ok("nonce CSP without unsafe-inline scripts", /script-src[^;]*'nonce-/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 120));
    const ptext = await (await page.goto(base + "/pricing"), page.locator("main").innerText());
    ok("pricing shows catalog prices", ptext.includes("$19") && ptext.includes("$79"));
    for (const p of ["/", "/pricing", "/signup"]) await fits390(p);

    // Real anonymous scan (needs internet; example.com is IANA's reserved example site).
    await page.goto(base + "/");
    await page.getByLabel(/website|url|address/i).first().fill("example.com");
    await page.getByRole("button", { name: "Inspect site" }).click();
    await page.getByText(/out of 100|Score/i).first().waitFor({ timeout: 90_000 });
    ok("anonymous scan of example.com produced a report", true);
    await axe("/ (report shown)");

    await page.goto(base + "/signup");
    await page.locator("#name").fill("Smoke Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your inbox").waitFor({ timeout: 15_000 });
    ok("sign-up asks to confirm email", true);
    const admin = await page.goto(base + "/admin");
    ok("/admin 404 when signed out", admin?.status() === 404, String(admin?.status()));
    await context.storageState({ path: stateFile });
  } else {
    await page.goto(link);
    await page.getByText("Email confirmed").waitFor({ timeout: 20_000 });
    ok("verification link confirms and signs in", true);

    const dash = await page.goto(base + "/dashboard");
    ok("dashboard 200", dash?.status() === 200, String(dash?.status()));
    await axe("/dashboard");
    // Free plan: monitoring needs a paid plan, so the dashboard explains the plans instead of an add-site form.
    const dtext = await page.locator("main").innerText();
    ok("free dashboard explains one-off scans and paid plans", /free plan/i.test(dtext) && /\$19\/month/.test(dtext), dtext.slice(0, 200));
    const add = await page.request.post(base + "/api/sites", { data: { url: "example.com" }, headers: { origin: base } });
    ok("server refuses adding a monitored site on Free", add.status() >= 400 && add.status() < 500, String(add.status()));

    const billing = await page.goto(base + "/account/billing");
    ok("billing 200", billing?.status() === 200);
    const btext = await page.locator("main").innerText();
    ok("billing says payments not switched on", /not (switched on|configured)/i.test(btext), btext.slice(0, 160));
    await axe("/account/billing");
    await fits390("/account/team");
    await axe("/account/team");

    const admin = await page.goto(base + "/admin");
    ok("/admin 404 for a customer", admin?.status() === 404, String(admin?.status()));

    await page.goto(base + "/account");
    await axe("/account");
    await page.locator("#delete-password").fill(PASSWORD);
    await page.locator('input[name="confirm"]').check();
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.waitForURL(/account=deleted/, { timeout: 20_000 });
    ok("account deleted", true);
    const relogin = await page.request.post(base + "/api/auth/sign-in/email", {
      data: { email, password: PASSWORD },
      headers: { origin: base },
    });
    ok("login refused after deletion", relogin.status() === 401, String(relogin.status()));
  }
} catch (e) {
  report.failures.push(`exception: ${e.message}`);
}
ok("no CSP violations", report.cspViolations.length === 0, report.cspViolations.join(" | "));
await browser.close();
writeFileSync(1, JSON.stringify({ phase, checks: report.checks.length, failures: report.failures, consoleErrors: report.consoleErrors }, null, 2) + "\n");
process.exit(report.failures.length ? 1 : 0);
