/**
 * Real-browser check of the live domains (headless Edge via Playwright), desktop and mobile.
 * For each page: HTTP status, console errors, failed CSS/JS/font requests, horizontal overflow, title,
 * canonical link and meta robots; saves a full-page screenshot.
 *   SITE_PASSWORD=... npx tsx scripts/live-render-check.mts <outDir>
 * SITE_PASSWORD is only needed while the sites are behind the launch gate.
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "render-check";
mkdirSync(out, { recursive: true });
const domains = ["gridrinse.com", "changekite.com", "webhooktrail.com"];
const pages = ["/", "/pricing", "/signup", "/login", "/help", "/privacy", "/terms"];
const password = process.env.SITE_PASSWORD;
const profiles = {
  desktop: { viewport: { width: 1366, height: 900 } },
  mobile: { ...devices["iPhone 13"] },
} as const;

const browser = await chromium.launch({ channel: "msedge", headless: true });
const results: unknown[] = [];
for (const [profile, opts] of Object.entries(profiles)) {
  const ctx = await browser.newContext({
    ...opts,
    ...(password ? { httpCredentials: { username: "owner", password } } : {}),
  });
  for (const d of domains) {
    for (const p of pages) {
      const page = await ctx.newPage();
      const consoleErrors: string[] = [];
      const failed: string[] = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
      page.on("response", (r) => {
        const t = r.request().resourceType();
        if (["stylesheet", "script", "font", "image"].includes(t) && r.status() >= 400) failed.push(`${r.status()} ${t} ${r.url()}`);
      });
      page.on("requestfailed", (r) => failed.push(`failed ${r.resourceType()} ${r.url()} ${r.failure()?.errorText}`));
      const res = await page.goto(`https://${d}${p}`, { waitUntil: "networkidle", timeout: 45_000 }).catch((e) => e as Error);
      const status = res instanceof Error ? `error ${res.message.slice(0, 120)}` : res?.status();
      const info = await page
        .evaluate(() => ({
          title: document.title,
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
          robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
          h1: document.querySelector("h1")?.textContent?.trim().slice(0, 100) ?? null,
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
          stylesheets: document.styleSheets.length,
          scripts: document.scripts.length,
        }))
        .catch(() => null);
      const shot = join(out, `${profile}-${d}${p === "/" ? "-home" : p.replace(/\//g, "-")}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
      results.push({ profile, url: `https://${d}${p}`, status, ...info, consoleErrors, failed });
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
for (const r of results as any[]) {
  const problems = [r.overflowX ? "OVERFLOW-X" : "", r.consoleErrors.length ? `console:${r.consoleErrors.length}` : "", r.failed.length ? `failed:${r.failed.length}` : ""].filter(Boolean).join(" ");
  console.log(`${r.profile.padEnd(7)} ${String(r.status).padEnd(4)} ${r.url.padEnd(36)} css=${r.stylesheets} canon=${r.canonical} robots=${r.robots} ${problems}`);
}
