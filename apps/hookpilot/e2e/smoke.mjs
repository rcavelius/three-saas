// Headless smoke test of a running production server (next start). Edge, headless, never a visible window.
//   node e2e/smoke.mjs <baseUrl> phase1 <stateFile> <email>
//   node e2e/smoke.mjs <baseUrl> phase2 <stateFile> <email> <verifyLink>
import { writeFileSync, existsSync } from "node:fs";
import { chromium, request as pwRequest } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const [base, phase, stateFile, email, link] = process.argv.slice(2);
const PASSWORD = "smoke-test-password-123";
const report = { phase, checks: [], axe: {}, consoleErrors: [], cspViolations: [], failures: [] };
const ok = (name, cond, detail = "") => {
  report.checks.push({ name, ok: Boolean(cond), detail });
  if (!cond) report.failures.push(`${name} ${detail}`);
};

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext(phase === "phase2" && existsSync(stateFile) ? { storageState: stateFile } : {});

function watch(page) {
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(t)) report.cspViolations.push(`${page.url()} :: ${t}`);
    else if (m.type() === "error") report.consoleErrors.push(`${page.url()} :: ${t}`);
  });
  page.on("pageerror", (e) => report.consoleErrors.push(`${page.url()} :: pageerror ${e.message}`));
}

async function axe(page, name) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  report.axe[name] = bad.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
  ok(`axe ${name}: no serious/critical`, bad.length === 0, JSON.stringify(report.axe[name]));
}

async function noHorizontalScroll(page, name) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(`mobile ${name}: no horizontal scroll`, w[0] <= w[1] + 1, `${w[0]} > ${w[1]}`);
}

const page = await context.newPage();
watch(page);

try {
  if (phase === "phase1") {
    const home = await page.goto(base + "/");
    ok("home 200", home?.status() === 200);
    const csp = home?.headers()["content-security-policy"] ?? "";
    ok("home has nonce CSP without unsafe-inline scripts", /script-src 'self' 'nonce-/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), csp);
    await axe(page, "home");

    await page.getByRole("button", { name: /Create endpoint/ }).first().click();
    await page.waitForURL(/\/e\//, { timeout: 20_000 });
    const captureUrl = await page.locator("#capture-url").inputValue();
    ok("inspector shows capture URL", /\/h\/[A-Za-z0-9_-]{24}$/.test(captureUrl), captureUrl);
    const api = await pwRequest.newContext();
    const cap = await api.post(captureUrl + "/smoke", { data: { event: "smoke.ping", password: "hunter2-secret", card: "4242424242424242" } });
    ok("capture 200", cap.status() === 200, String(cap.status()));
    await page.getByText("/smoke").first().waitFor({ timeout: 15_000 });
    await page.getByText("/smoke").first().click();
    await page.getByText(/secret-looking field/).first().waitFor({ timeout: 10_000 });
    const body = await page.locator("article").first().innerText();
    ok("body secret masked by default", !body.includes("hunter2-secret") && !body.includes("4242424242424242"));
    ok("live state visible", /LIVE/.test(await page.locator("body").innerText()));
    await axe(page, "inspector");
    const inspectorUrl = page.url();

    const m = await context.newPage();
    watch(m);
    await m.setViewportSize({ width: 390, height: 844 });
    await m.goto(base + "/");
    await noHorizontalScroll(m, "home");
    await m.goto(inspectorUrl);
    await m.locator("#capture-url").waitFor();
    await noHorizontalScroll(m, "inspector");
    await m.goto(base + "/pricing");
    await noHorizontalScroll(m, "pricing");
    await m.close();

    const pricing = await page.goto(base + "/pricing");
    ok("pricing 200", pricing?.status() === 200);
    const ptext = await page.locator("main").innerText();
    ok("pricing shows catalog prices", ptext.includes("$9") && ptext.includes("$29") && ptext.includes("$0"));
    await axe(page, "pricing");
    await page.goto(base + "/docs");
    await axe(page, "docs");

    await page.goto(base + "/signup");
    await axe(page, "signup");
    await page.locator("#name").fill("Smoke Tester");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Check your inbox").waitFor({ timeout: 15_000 });
    ok("signup asks to confirm email", true);
    const admin = await page.goto(base + "/admin");
    ok("admin 404 for anonymous", admin?.status() === 404, String(admin?.status()));
    await context.storageState({ path: stateFile });
  } else {
    await page.goto(link);
    await page.waitForURL(/verify-email/, { timeout: 20_000 });
    await page.getByText("Email confirmed").waitFor({ timeout: 15_000 });
    ok("verification signs in", true);

    await page.goto(base + "/app");
    await page.getByRole("button", { name: /Claim my anonymous endpoints/ }).waitFor({ timeout: 15_000 });
    await axe(page, "dashboard");
    await page.getByRole("button", { name: /Claim my anonymous endpoints/ }).click();
    await page.getByText(/Claimed 1 endpoint/).waitFor({ timeout: 10_000 });
    ok("claimed anonymous endpoint", true);

    const billing = await page.goto(base + "/account/billing");
    ok("billing 200", billing?.status() === 200);
    ok("billing explains missing Stripe", (await page.locator("main").innerText()).includes("Billing is not configured"));
    await axe(page, "billing");
    await page.getByRole("button", { name: /Upgrade to Developer/ }).click();
    await page.getByText(/not configured on this server/).first().waitFor({ timeout: 10_000 });
    ok("checkout without Stripe shows a clear message", true);

    await page.goto(base + "/account/team");
    await axe(page, "team");
    await page.goto(base + "/account/destinations");
    await axe(page, "destinations");
    const admin = await page.goto(base + "/admin");
    ok("admin 404 for customers", admin?.status() === 404, String(admin?.status()));

    await page.goto(base + "/account");
    await axe(page, "account");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    await page.locator('input[type="password"]').last().fill(PASSWORD);
    await page.getByRole("button", { name: "Delete everything permanently" }).click();
    await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 });
    const api = await pwRequest.newContext();
    const login = await api.post(base + "/api/auth/sign-in/email", { data: { email, password: PASSWORD }, headers: { origin: base } });
    ok("account deleted (login fails)", login.status() >= 400, String(login.status()));
  }
} catch (e) {
  report.failures.push(`exception: ${e.message}`);
  await page.screenshot({ path: `e2e-failure-${phase}.png` }).catch(() => {});
} finally {
  await browser.close();
}
ok("no CSP violations", report.cspViolations.length === 0, report.cspViolations.join(" | "));
writeFileSync(`e2e-report-${phase}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ phase, failures: report.failures, checks: report.checks.length, consoleErrors: report.consoleErrors.slice(0, 10) }, null, 2));
process.exit(report.failures.length ? 1 : 0);
