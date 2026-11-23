// Headless screenshots for design review rounds: desktop (1440) and phone (390) full-page captures.
// Usage: node scripts/design-shots.mjs <outDir> <name>=<url> [<name>=<url> ...]
// Runs headless only (no windows). Uses the installed Edge/Chrome via Playwright's channel option.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [outDir, ...pairs] = process.argv.slice(2);
if (!outDir || !pairs.length) {
  console.error("usage: node scripts/design-shots.mjs <outDir> name=url ...");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const channels = ["chrome", "msedge", undefined];
let browser;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ headless: true, channel });
    break;
  } catch {
    /* try next */
  }
}
if (!browser) throw new Error("No Chromium browser available");

const viewports = [
  { tag: "desktop", width: 1440, height: 900, mobile: false },
  { tag: "phone", width: 390, height: 844, mobile: true },
];
const fullPage = !process.env.SHOTS_VIEWPORT_ONLY;

for (const pair of pairs) {
  const i = pair.indexOf("=");
  const name = pair.slice(0, i);
  const url = pair.slice(i + 1);
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      reducedMotion: process.env.SHOTS_REDUCED ? "reduce" : "no-preference",
    });
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    // Let entrance animations settle, and scroll through so scroll-triggered reveals fire.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(Number(process.env.SHOTS_WAIT ?? 2500));
    const file = join(outDir, `${name}-${vp.tag}.png`);
    await page.screenshot({ path: file, fullPage });
    console.log(`${res?.status()} ${file}`);
    await ctx.close();
  }
}
await browser.close();
