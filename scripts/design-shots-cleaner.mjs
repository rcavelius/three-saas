// Headless design shot of GridRinse's Cleaner in use: opens the page, loads the messy sample and captures the review
// stage (desktop 1440 and phone 390, viewport only). Usage: node scripts/design-shots-cleaner.mjs <url> <outDir>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: node scripts/design-shots-cleaner.mjs <url> <outDir>");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

let browser;
for (const channel of ["chrome", "msedge", undefined]) {
  try {
    browser = await chromium.launch({ headless: true, channel });
    break;
  } catch {
    /* try next */
  }
}
if (!browser) throw new Error("No Chromium browser available");

for (const vp of [
  { tag: "desktop", width: 1440, height: 900, mobile: false },
  { tag: "phone", width: 390, height: 844, mobile: true },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: /clean a messy sample file/i }).first().click();
  const heading = page.locator("#preview-heading");
  await heading.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2500);
  await heading.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(800);
  const file = join(outDir, `gr-cleaner-${vp.tag}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await ctx.close();
}
await browser.close();
