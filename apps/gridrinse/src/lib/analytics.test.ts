import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEvent, EVENT_SPEC, landingSource, sanitizeEventProps, track } from "./analytics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analytics never carries cell data or file names", () => {
  it("drops unknown keys and any free-text value", () => {
    const out = sanitizeEventProps("tool_used", {
      action: "download_zip",
      mode: "batch",
      files: 4,
      steps: 12.4,
      format: "zip_csv",
      fileName: "customers-2026.csv",
      name: "customers-2026.csv",
      cell: "Jane Doe, 12 Main St",
      column: "Email",
    });
    expect(out).toEqual({ action: "download_zip", mode: "batch", files: 4, steps: 12, format: "zip_csv" });
  });

  it("rejects values outside each enum, even for allowed keys", () => {
    expect(sanitizeEventProps("tool_used", { mode: "orders.xlsx", format: "Jane Doe", action: "=HYPERLINK()" })).toEqual({});
    expect(sanitizeEventProps("upgrade_clicked", { plan: "pro", from: "payroll.csv" })).toEqual({ plan: "pro" });
  });

  it("counts are clamped integers; strings are never accepted as counts", () => {
    expect(sanitizeEventProps("tool_used", { files: "1234-5678-9012" as unknown as number, steps: Number.POSITIVE_INFINITY })).toEqual({});
    expect(sanitizeEventProps("tool_used", { files: 1e9 })).toEqual({ files: 10_000 });
  });

  it("no event accepts an arbitrary string property", () => {
    for (const spec of Object.values(EVENT_SPEC) as Record<string, unknown>[]) {
      for (const rule of Object.values(spec)) expect(rule === "count" || Array.isArray(rule)).toBe(true);
    }
  });

  it("buildEvent sends the pathname only (no query string or fragment)", () => {
    const e = buildEvent("pageview", {}, "/guides/fix-excel-dates");
    expect(e.path).toBe("/guides/fix-excel-dates");
    expect(Object.keys(e).sort()).toEqual(["anonymousId", "name", "path", "props"]);
  });

  it("landingSource sends only the referrer origin and utm values, and marks visits from other sites as landings", () => {
    vi.stubGlobal("document", { referrer: "https://www.google.com/search?q=private+words" });
    vi.stubGlobal("location", { pathname: "/tools/x", search: "?utm_source=reddit&utm_campaign=launch&email=a@b.example", origin: "https://gridrinse.com" });
    const s = landingSource();
    expect(s).toEqual({ referrer: "https://www.google.com", utm: { source: "reddit", campaign: "launch" }, landing: true });
    expect(JSON.stringify(s)).not.toMatch(/private|a@b/);
    vi.stubGlobal("document", { referrer: "https://gridrinse.com/guides/y" });
    expect(landingSource().landing).toBe(false);
  });

  it("track posts only the sanitized payload to our own /api/events", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
    vi.stubGlobal("location", { pathname: "/" });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    track("tool_used", { action: "download_csv", files: 1, ...({ fileName: "secret-marker.csv", cell: "secret-marker" } as object) });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/events");
    expect(calls[0]!.body).not.toContain("secret-marker");
    expect(JSON.parse(calls[0]!.body).props).toEqual({ action: "download_csv", files: 1 });
  });
});
