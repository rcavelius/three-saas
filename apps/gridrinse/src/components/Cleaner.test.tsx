// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRIDRINSE_CATALOG, getFreePlan } from "@repo/billing";
import { processingLimits } from "@/lib/limits";
import { Cleaner } from "./Cleaner";

const blobs: { blob: Blob; name: string }[] = [];
const free = getFreePlan(GRIDRINSE_CATALOG);
const freeLimits = processingLimits(free.id, free.name, free.limits);
/** Every network call the component makes: only first-party analytics beacons are allowed. */
const sent: { url: string; body: string }[] = [];

beforeEach(() => {
  blobs.length = 0;
  sent.length = 0;
  let lastBlob: Blob | null = null;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => ((lastBlob = b), "blob:test"), revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (lastBlob) blobs.push({ blob: lastBlob, name: this.download });
  });
  const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: typeof init?.body === "string" ? init.body : "" });
    if (String(url) === "/api/events") return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.reject(new Error("network calls are not allowed"));
  });
  vi.stubGlobal("fetch", fetchSpy);
});

const anonymous = async () => null;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const status = () => document.querySelector('[role="status"]')!.textContent ?? "";

describe("Cleaner (main flow)", () => {
  it("loads the sample, previews changes, asks about ambiguous dates and downloads CSV; only content-free analytics leave the page", async () => {
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} />);
    fireEvent.click(screen.getByRole("button", { name: "Try a sample file" }));

    await waitFor(() => expect(status()).toMatch(/Cleaned: 20 rows in, 16 rows out/), { timeout: 5000 });
    expect(screen.getByRole("tab", { name: "Removed rows (4)" })).toBeTruthy();

    // The ambiguous Signup Date column is flagged, not guessed.
    const dmy = screen.getByRole("button", { name: "Day first (DMY)" });
    const before = Number(/(\d+) cells changed/.exec(status())![1]);
    fireEvent.click(dmy);
    await waitFor(() => expect(Number(/(\d+) cells changed/.exec(status())?.[1] ?? 0)).toBeGreaterThan(before), { timeout: 5000 });
    expect(screen.queryByRole("button", { name: "Day first (DMY)" })).toBeNull();

    // Removed rows are listed with the reason.
    fireEvent.click(screen.getByRole("tab", { name: /Removed rows/ }));
    const removedTable = screen.getByRole("table", { name: /Rows the cleaning steps removed/ });
    expect(within(removedTable).getAllByText("Remove blank rows").length).toBe(3);
    expect(within(removedTable).getAllByText("Remove duplicate rows").length).toBe(1);

    // Download the cleaned CSV.
    const csvButton = screen.getByRole("button", { name: "Download cleaned CSV" }) as HTMLButtonElement;
    await waitFor(() => expect(csvButton.disabled).toBe(false));
    fireEvent.click(csvButton);
    await waitFor(() => expect(blobs.length).toBe(1));
    expect(blobs[0]!.name).toBe("sample-orders-export-clean.csv");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new TextDecoder("utf-8", { ignoreBOM: true }).decode(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blobs[0]!.blob);
    });
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain("Order ID,Customer Name,Email,Order Date,Signup Date,Amount");
    expect(text).toContain("10232,Tom Becker,tom.becker@example.org,2024-01-15,2023-06-05,89.99");
    expect(text).toContain("10234,Liam O'Brien,liam.obrien@example.com,2024-01-18,2023-08-07,-45.00");
    // The only requests were analytics beacons, and none carries a file name or a cell value.
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) {
      expect(s.url).toBe("/api/events");
      expect(s.body).not.toMatch(/sample-orders|Becker|tom\.becker|10232|89\.99|Order ID/i);
      const ev = JSON.parse(s.body) as { name: string; props: Record<string, unknown> };
      expect(ev.name).toBe("tool_used");
      for (const v of Object.values(ev.props)) expect(typeof v === "number" || /^[a-z_]+$/.test(String(v))).toBe(true);
    }
  });

  it("rejects unsupported and oversized files with a clear message", async () => {
    render(<Cleaner freeLimits={freeLimits} loadEntitlements={anonymous} />);
    const input = document.getElementById("file-input") as HTMLInputElement;
    const big = new File(["x"], "big.csv", { type: "text/csv" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    const pdf = new File(["%PDF"], "report.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [big, pdf] } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/big\.csv is 6\.0 MB/);
    expect(alert.textContent).toMatch(/report\.pdf: not a CSV or Excel file/);
  });
});
