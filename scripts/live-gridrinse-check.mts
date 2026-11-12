/**
 * Live customer test of the GridRinse cleaner on the deployed site (no account needed): uploads a messy CSV
 * and a messy XLSX in headless Edge, waits for cleaning, downloads the cleaned CSV and XLSX and checks the
 * data cell by cell.  SITE_PASSWORD=... npx tsx scripts/live-gridrinse-check.mts <workDir> [baseUrl]
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/gridrinse/package.json", import.meta.url));
const XLSX = require("xlsx") as typeof import("xlsx");

const dir = process.argv[2] ?? "gridrinse-check";
const base = process.argv[3] ?? "https://gridrinse.com";
mkdirSync(dir, { recursive: true });

const header = ["Customer", "Order date", "Amount"];
const messy = [
  ["  Maria   Lopez ", "Jan 17, 2024", "$1,234.50"],
  ["Ethan Clark", "2024-01-15", "(45.00)"],
  ["", "", ""],
  ["  Maria   Lopez ", "Jan 17, 2024", "$1,234.50"],
  ["Zoë Brandt ", "29 Feb 2024", "1,000"],
];
const expected = [
  ["Maria Lopez", "2024-01-17", 1234.5],
  ["Ethan Clark", "2024-01-15", -45],
  ["Zoë Brandt", "2024-02-29", 1000],
];
const csvPath = join(dir, "messy-orders.csv");
writeFileSync(csvPath, [header, ...messy].map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n"));
const xlsxPath = join(dir, "messy-orders.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...messy]), "Orders");
XLSX.writeFile(wb, xlsxPath);

function check(label: string, rows: unknown[][]): string[] {
  const errs: string[] = [];
  const body = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (JSON.stringify(body[0]) !== JSON.stringify(header)) errs.push(`${label}: header ${JSON.stringify(body[0])}`);
  const data = body.slice(1);
  if (data.length !== expected.length) errs.push(`${label}: ${data.length} data rows, expected ${expected.length}: ${JSON.stringify(data)}`);
  expected.forEach((exp, i) => {
    const got = data[i] ?? [];
    if (String(got[0]) !== exp[0]) errs.push(`${label} row ${i + 1} name: ${JSON.stringify(got[0])} != ${exp[0]}`);
    if (String(got[1]).slice(0, 10) !== exp[1]) errs.push(`${label} row ${i + 1} date: ${JSON.stringify(got[1])} != ${exp[1]}`);
    if (Number(String(got[2]).replace(/,/g, "")) !== exp[2]) errs.push(`${label} row ${i + 1} amount: ${JSON.stringify(got[2])} != ${exp[2]}`);
  });
  return errs;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({
  acceptDownloads: true,
  ...(process.env.SITE_PASSWORD ? { httpCredentials: { username: "owner", password: process.env.SITE_PASSWORD } } : {}),
});
const page = await ctx.newPage();
const uploads: string[] = [];
page.on("request", (r) => {
  if (r.method() !== "GET" && r.postDataBuffer() && (r.postDataBuffer()!.length > 200)) uploads.push(`${r.method()} ${r.url()} ${r.postDataBuffer()!.length}B`);
});
let failures: string[] = [];
for (const [label, file] of [["CSV", csvPath], ["XLSX", xlsxPath]] as const) {
  await page.goto(base + "/");
  await page.getByLabel("Choose CSV or Excel files").setInputFiles(file);
  await page.locator('p.sr-only[role="status"]').filter({ hasText: /Cleaned:/ }).waitFor({ timeout: 30_000 });
  const status = await page.locator('p.sr-only[role="status"]').textContent();
  console.log(`${label} upload -> status: ${status?.trim()}`);
  await page.screenshot({ path: join(dir, `cleaned-${label}.png`), fullPage: true });
  for (const kind of ["CSV", "XLSX"] as const) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: `Download cleaned ${kind}` }).first().click()]);
    const target = join(dir, `${label}-to-${dl.suggestedFilename()}`);
    await dl.saveAs(target);
    const book = XLSX.read(readFileSync(target), { type: "buffer", raw: kind === "CSV", cellDates: false });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]!]!, { header: 1, raw: false, defval: "" });
    const errs = check(`${label}->${kind}`, rows);
    console.log(`${label} -> cleaned ${kind} (${dl.suggestedFilename()}): ${errs.length ? "MISMATCH" : "matches expected"}`);
    if (errs.length) console.log("  " + JSON.stringify(rows));
    failures = failures.concat(errs);
  }
}
console.log(`requests carrying file-sized bodies: ${uploads.length ? uploads.join("; ") : "none (file never uploaded)"}`);
await browser.close();
if (failures.length) {
  console.log("FAIL\n" + failures.join("\n"));
  process.exit(1);
}
console.log("PASS");
