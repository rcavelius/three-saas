// Headless check + screenshots of the homepage explainer loops on the live sites.
// Usage: node scripts/explainer-live-shots.mjs <outDir> <name>=<url> [...]
// For each page and viewport: scroll the loop into view, confirm it is playing (currentTime advances),
// then save a fold screenshot of the tile. Prints one JSON line per capture. Headless only.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [outDir, ...pairs] = process.argv.slice(2);
if (!outDir || !pairs.length) {
  console.error("usage: node scripts/explainer-live-shots.mjs <outDir> name=url ...");
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

const viewports = [
  { tag: "desktop", width: 1440, height: 900, mobile: false },
  { tag: "phone", width: 390, height: 844, mobile: true },
];

let failed = 0;
for (const pair of pairs) {
  const i = pair.indexOf("=");
  const name = pair.slice(0, i);
  const url = pair.slice(i + 1);
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const fetchedBeforeScroll = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => /\/video\/explainer\.(webm|mp4)/.test(e.name)).length);
    const video = page.locator("video").first();
    await video.scrollIntoViewIfNeeded();
    const tile = video.locator("xpath=ancestor::*[self::section or @role='group'][1]");
    await tile.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1500);
    const t1 = await video.evaluate((v) => v.currentTime);
    await page.waitForTimeout(1500);
    const state = await video.evaluate((v) => ({ t: v.currentTime, paused: v.paused, src: v.currentSrc.split("/").pop(), w: v.clientWidth }));
    const playing = !state.paused && state.t > t1;
    if (!playing) failed++;
    const file = join(outDir, `${name}-${vp.tag}.png`);
    await page.screenshot({ path: file });
    console.log(JSON.stringify({ name, viewport: vp.tag, fetchedBeforeScroll, playing, ...state, overflowX: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), file }));
    await ctx.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
