/**
 * Proof that files are not uploaded: run the full clean / merge / batch / ZIP flow with files that
 * contain a unique marker (in cells AND in the file names), record every request the page, its
 * workers and beacons make, and assert that no URL or body contains the marker or file bytes.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Request } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

/** Netlify injects its own toolbar script into hosted pages; our CSP blocks it (as intended), so its report is ignored. */
const HOST_INJECTED = /\/\.netlify\/scripts\/hud/;

const MARKER = `DPMARK${randomUUID().replace(/-/g, "")}`;

function csv(n: number): string {
  const rows = ["Order ID,Customer,Email,Amount,Note"];
  for (let i = 0; i < 40; i++) rows.push(`${n}${String(i).padStart(3, "0")},  Customer ${i} ${MARKER}  ,c${i}@example.com,"$1,2${i}.50",${MARKER}-note-${i}`);
  rows.push(",,,,");
  rows.push(rows[1]!); // a duplicate row
  return rows.join("\r\n");
}

const files = [1, 2, 3].map((n) => ({ name: `export-${n}-${MARKER}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv(n), "utf8") }));

/** Variants a leak could take: raw, URL-encoded, base64 (of the marker and of a file slice). */
function needles(): string[] {
  const slice = files[0]!.buffer.subarray(40, 120);
  return [MARKER, encodeURIComponent(MARKER), Buffer.from(MARKER).toString("base64").slice(0, 24), slice.toString("utf8"), slice.toString("base64").slice(0, 40)];
}

test("cleaning, merging, batch and ZIP export never send file names or contents over the network", async ({ page, context }) => {
  const seen: { url: string; method: string; type: string; body: string }[] = [];
  const record = (r: Request) => {
    const buf = r.postDataBuffer();
    seen.push({ url: r.url(), method: r.method(), type: r.resourceType(), body: buf ? buf.toString("latin1") : "" });
  };
  context.on("request", record);
  // Beacon bodies are not exposed to Playwright; record any sendBeacon payload in the page as well.
  await context.addInitScript(() => {
    const w = window as unknown as { __beacons: string[] };
    w.__beacons = [];
    const orig = navigator.sendBeacon?.bind(navigator);
    if (orig) {
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        w.__beacons.push(`${String(url)} ${typeof data === "string" ? data : data instanceof Blob ? "[blob]" : String(data ?? "")}`);
        return orig(url, data);
      };
    }
  });
  page.on("websocket", (ws) => seen.push({ url: ws.url(), method: "WS", type: "websocket", body: "" }));
  const cspViolations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text());
  });

  const res = await page.goto("/");
  // connect-src stays 'self' only.
  const csp = res!.headers()["content-security-policy"] ?? "";
  const connect = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
  expect(connect).toBe("connect-src 'self'");

  // Load three files (merge mode is the default for several files).
  await page.locator("#file-input").setInputFiles(files);
  const status = page.locator('p.sr-only[role="status"]');
  await expect(status).toContainText(/Cleaned: 126 rows in/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Review your cleaned data" })).toBeVisible();
  await expect(page.getByText(/^\d+ files merged$/)).toBeVisible();

  const dlMerged = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download cleaned CSV" }).click();
  const merged = await dlMerged;
  expect(merged.suggestedFilename()).toBe("merged-clean.csv");
  expect(readFileSync((await merged.path())!, "utf8")).toContain(MARKER); // processed locally, with the data

  // Batch mode: each file cleaned separately, exported as one ZIP (CSV and XLSX).
  await page.getByRole("radio", { name: /Batch/ }).check();
  await expect(status).toContainText(/Cleaned 3 files/, { timeout: 30_000 });
  const dlZip = page.waitForEvent("download");
  await page.getByRole("button", { name: "All files → ZIP of CSVs" }).click();
  const zip = await dlZip;
  expect(zip.suggestedFilename()).toMatch(/^gridrinse-batch-\d{4}-\d{2}-\d{2}\.zip$/);
  const entries = unzipSync(readFileSync((await zip.path())!));
  expect(Object.keys(entries).sort()).toEqual(files.map((f) => f.name.replace(".csv", "-clean.csv")).sort());
  expect(strFromU8(Object.values(entries)[0]!)).toContain(MARKER);

  const dlZipX = page.waitForEvent("download");
  await page.getByRole("button", { name: "All files → ZIP of XLSX" }).click();
  expect(Object.keys(unzipSync(readFileSync((await (await dlZipX).path())!)))).toHaveLength(3);

  // Save the steps as a workflow in this browser (localStorage only).
  await page.getByLabel("Workflow name").fill("Marker test");
  await page.getByRole("button", { name: "Save in this browser" }).click();
  await expect(page.getByText('Saved "Marker test" in this browser.')).toBeVisible();

  // Let pending analytics calls flush, then leave the page.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __beacons: string[] }).__beacons)).toEqual([]);
  await page.goto("/pricing");
  await page.waitForTimeout(500);

  // A deliberate attempt to send data elsewhere is blocked by the browser (CSP connect-src 'self').
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://example.com/collect", { method: "POST", body: "x", mode: "no-cors" });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);

  // Every request was same-origin, and none carried the marker or file bytes.
  const offenders = seen.filter((s) => needles().some((n) => s.url.includes(n) || s.body.includes(n)));
  expect(offenders, JSON.stringify(offenders.slice(0, 3), null, 2)).toEqual([]);
  // edge:// and chrome:// are the browser's own UI (e.g. the downloads bubble), not page traffic.
  const foreign = seen.filter((s) => /^(https?|wss?):/.test(s.url) && !s.url.startsWith(new URL(process.env.E2E_BASE_URL ?? "http://localhost:3102").origin + "/"));
  expect(foreign.map((f) => f.url).filter((u) => u !== "https://example.com/collect")).toEqual([]);
  // The analytics calls were recorded too (so the check above covered them).
  const events = seen.filter((s) => s.url.endsWith("/api/events"));
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) expect(JSON.parse(e.body).name).toMatch(/^(pageview|tool_used)$/);
  // No POST/PUT anywhere except analytics.
  expect(seen.filter((s) => s.method !== "GET" && !s.url.endsWith("/api/events") && s.url !== "https://example.com/collect")).toEqual([]);
  expect(cspViolations.filter((v) => !v.includes("example.com") && !HOST_INJECTED.test(v))).toEqual([]);
});
