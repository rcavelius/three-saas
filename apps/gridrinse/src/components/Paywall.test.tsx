// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRIDRINSE_CATALOG, getFreePlan } from "@repo/billing";
import { processingLimits, type ClientEntitlements } from "@/lib/limits";
import { passOffer, upgradeOffers } from "@/server/plans";
import { Cleaner } from "./Cleaner";

const blobs: { blob: Blob; name: string }[] = [];
const free = getFreePlan(GRIDRINSE_CATALOG);
const freeLimits = processingLimits(free.id, free.name, free.limits);
const offers = upgradeOffers();
const pass = passOffer()!;
/** Every network call the component makes. */
const sent: { url: string; body: string }[] = [];

function stubFetch(checkoutUrl?: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: typeof init?.body === "string" ? init.body : "" });
      if (String(url) === "/api/events") return Promise.resolve(new Response(null, { status: 204 }));
      if (checkoutUrl && String(url) === "/api/billing/pass/checkout") return Promise.resolve(Response.json({ url: checkoutUrl }));
      return Promise.reject(new Error("network calls are not allowed"));
    }),
  );
}

beforeEach(() => {
  blobs.length = 0;
  sent.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  let lastBlob: Blob | null = null;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => ((lastBlob = b), "blob:test"), revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (lastBlob) blobs.push({ blob: lastBlob, name: this.download });
  });
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const anonymous = async () => null;
const status = () => document.querySelector('p[role="status"]')!.textContent ?? "";
const events = () => sent.filter((s) => s.url === "/api/events").map((s) => JSON.parse(s.body) as { name: string; props: Record<string, unknown> });

/** A visitor's own CSV (jsdom's File has no arrayBuffer(); browsers do). */
function ownFile(rows: number, name = "customers.csv") {
  const lines = ["Name,City"];
  for (let i = 0; i < rows; i++) lines.push(`Person ${i},City ${i}`);
  const text = lines.join("\n") + "\n";
  const file = new File([text], name, { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode(text).buffer });
  return file;
}

async function loadOwn(rows: number) {
  fireEvent.change(document.getElementById("file-input") as HTMLInputElement, { target: { files: [ownFile(rows)] } });
  await waitFor(() => expect(status()).toMatch(new RegExp(`Cleaned: ${rows.toLocaleString("en-US")} rows in`)), { timeout: 10_000 });
  const csv = screen.getByRole("button", { name: "Download cleaned CSV" }) as HTMLButtonElement;
  await waitFor(() => expect(csv.disabled).toBe(false));
  return csv;
}

const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("download paywall (free: up to 1,000 rows, one download a day)", () => {
  it("a cleaned file over 1,000 rows shows the paywall instead of downloading; one click keeps the work and opens pass checkout", async () => {
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    const csv = await loadOwn(1_200);
    fireEvent.click(csv);
    const panel = await screen.findByRole("region", { name: "Your cleaned file is ready — 1,200 rows." });
    expect(blobs.length).toBe(0);
    expect(panel.textContent).toMatch(/Free downloads are up to 1,000 rows \(one a day\)\./);
    expect(panel.textContent).toMatch(/One-time payment, no subscription, no account needed/);
    expect(panel.textContent).toMatch(/never uploaded/);
    expect(panel.textContent).toMatch(/After paying, you.ll come back here\. Your cleaning steps are kept/);
    const buy = within(panel).getByRole("button", { name: "Download with a 24-hour pass — $5" });
    const pro = within(panel).getByRole("link", { name: "or Pro, $9/month" });
    expect(pro.getAttribute("href")).toBe("/signup?plan=pro");
    expect(follows(buy, pro)).toBe(true);
    await waitFor(() => expect(events().find((e) => e.name === "paywall_shown")?.props).toEqual({ reason: "download_rows" }));

    stubFetch("https://checkout.stripe.test/c/pay/cs_test_1");
    fireEvent.click(buy);
    await waitFor(() => expect(sent.some((s) => s.url === "/api/billing/pass/checkout")).toBe(true));
    const req = sent.find((s) => s.url === "/api/billing/pass/checkout")!;
    expect(JSON.parse(req.body)).toEqual({ passId: "day", returnPath: "/" });
    await waitFor(() => expect(events().find((e) => e.name === "pass_checkout_started")?.props).toEqual({ pass: "day", from: "download" }));
    // The steps (never the file contents) are kept in this tab's sessionStorage for the way back.
    const kept = window.sessionStorage.getItem("gridrinse.carryover.v1")!;
    expect(JSON.parse(kept).steps.steps.length).toBeGreaterThan(0);
    expect(kept).not.toMatch(/Person 1|City 1/);
    // No request carried the file: only analytics and the pass checkout (pass id + path).
    for (const s of sent) expect(s.body).not.toMatch(/Person 1|customers\.csv/);
  });

  it("the free download is once a day: the second download today hits the paywall", async () => {
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    const csv = await loadOwn(3);
    fireEvent.click(csv);
    await waitFor(() => expect(blobs.length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Download cleaned XLSX" }));
    const panel = await screen.findByRole("region", { name: "Your cleaned file is ready — 3 rows." });
    expect(panel.textContent).toMatch(/You have used today's free download\./);
    expect(blobs.length).toBe(1);
    await waitFor(() => expect(events().find((e) => e.name === "paywall_shown")?.props).toEqual({ reason: "download_daily" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: /Your cleaned file is ready/ })).toBeNull();
  });

  it("the built-in sample stays downloadable after today's free download is used", async () => {
    window.localStorage.setItem("gridrinse.downloads.v1", JSON.stringify({ day: new Date().toISOString().slice(0, 10), count: 1 }));
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    fireEvent.click(screen.getByRole("button", { name: "Try a sample file" }));
    await waitFor(() => expect(status()).toMatch(/Cleaned: 20 rows in/), { timeout: 5000 });
    const csv = screen.getByRole("button", { name: "Download cleaned CSV" }) as HTMLButtonElement;
    await waitFor(() => expect(csv.disabled).toBe(false));
    fireEvent.click(csv);
    await waitFor(() => expect(blobs.length).toBe(1));
    expect(screen.queryByRole("region", { name: /Your cleaned file is ready/ })).toBeNull();
  });

  it("with an active pass every download goes through and the pass note shows the unlock link", async () => {
    const day = GRIDRINSE_CATALOG.passes!.find((p) => p.id === "day")!;
    const withPass = async (): Promise<ClientEntitlements> => ({
      signedIn: false,
      planId: "free",
      planName: "Free",
      status: "none",
      limits: { ...free.limits, ...day.limits },
      features: {},
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      graceEndsAt: null,
      org: null,
      usage: null,
      billingConfigured: true,
      pass: { name: "24-hour pass", expiresAt: "2026-11-24T10:00:00.000Z", unlockUrl: "https://gridrinse.com/api/billing/pass/claim?session_id=cs_test_abc&next=%2F" },
    });
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={withPass} offers={offers} pass={pass} />);
    const csv = await loadOwn(1_200);
    fireEvent.click(csv);
    await waitFor(() => expect(blobs.length).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Download cleaned XLSX" }));
    await waitFor(() => expect(blobs.length).toBe(2));
    expect(screen.queryByRole("region", { name: /Your cleaned file is ready/ })).toBeNull();
    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/24-hour pass active until/);
    expect((within(note).getByLabelText("Unlock link") as HTMLInputElement).value).toContain("session_id=cs_test_abc");
  });
});

describe("over-limit files offer the pass first", () => {
  it("a file over the free size offers the 24-hour pass first and Pro second; one too big for the pass gets plans only", async () => {
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    const big = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 12 * 1024 * 1024 });
    fireEvent.change(document.getElementById("file-input") as HTMLInputElement, { target: { files: [big] } });
    const notice = await screen.findByRole("complementary", { name: "Unlock with the 24-hour pass or Pro" });
    expect(notice.textContent).toMatch(/Open files up to 50 MB with a 24-hour pass or Pro/);
    const buy = within(notice).getByRole("button", { name: "Get the 24-hour pass — $5" });
    const pro = within(notice).getByRole("link", { name: "Get Pro · $9/month" });
    expect(follows(buy, pro)).toBe(true);
    expect(notice.textContent).toMatch(/one-time payment for 24 hours: no subscription, no account needed/);
    await waitFor(() => expect(events().find((e) => e.name === "paywall_shown")?.props).toEqual({ reason: "too_big" }));

    cleanup();
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    const huge = new File(["x"], "huge.csv", { type: "text/csv" });
    Object.defineProperty(huge, "size", { value: 120 * 1024 * 1024 });
    fireEvent.change(document.getElementById("file-input") as HTMLInputElement, { target: { files: [huge] } });
    expect(await screen.findByRole("complementary", { name: "Upgrade to Business" })).toBeTruthy();
  });
});

describe("back from checkout", () => {
  it("shows the status, removes ?pass= from the address, and applies the kept steps to the re-dropped file", async () => {
    window.history.replaceState(null, "", "/tools/x?pass=active");
    const steps = [{ type: "trim" }];
    window.sessionStorage.setItem(
      "gridrinse.carryover.v1",
      JSON.stringify({
        steps: { app: "gridrinse", version: 1, name: "carry-over", steps },
        mode: "merge",
        merge: { looseMatch: true, addSource: true, sourceName: "source_file" },
        csvOpts: { delimiter: ";", bom: true, lineEnding: "crlf", guardFormulas: false },
        activeIndex: 0,
        fileCount: 1,
        savedAt: Date.now(),
      }),
    );
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    const msg = await screen.findByText("Your cleaning steps are kept. Drop the file again to download.");
    expect(msg.closest('[role="status"]')!.textContent).toMatch(/Payment received\. Your pass is active\./);
    expect(window.location.pathname + window.location.search).toBe("/tools/x");
    await waitFor(() => expect(events().find((e) => e.name === "pass_activated")?.props).toEqual({ pass: "day" }));
    expect(window.sessionStorage.getItem("gridrinse.carryover.v1")).toBeNull();
    await loadOwn(2);
    const list = screen.getByRole("region", { name: /Cleaning steps/ }).querySelector("ol")!;
    expect(list.children.length).toBe(1);
    const sep = screen.getByText("Separator").querySelector("select") as HTMLSelectElement;
    expect(sep.value).toBe(";");
  });

  it("a canceled checkout says nothing was charged", async () => {
    window.history.replaceState(null, "", "/?pass=canceled");
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} offers={offers} pass={pass} />);
    expect(await screen.findByText("Checkout canceled. Nothing was charged.")).toBeTruthy();
  });
});
