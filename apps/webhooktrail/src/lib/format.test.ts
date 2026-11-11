import { describe, expect, it } from "vitest";
import { buildCurl, shellQuote } from "./curl";
import { decodeForm, decodeText, hexDump, isJsonType, relativeTime, tryParseJson } from "./format";
import { MASK } from "./sensitive";

describe("format helpers", () => {
  it("detects text vs binary", () => {
    expect(decodeText(new TextEncoder().encode("héllo\n"))).toBe("héllo\n");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
    expect(decodeText(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull();
    // truncated mid-character still decodes
    const bytes = new TextEncoder().encode("abc€");
    expect(decodeText(bytes.subarray(0, 5), true)).toMatch(/^abc/);
  });

  it("parses JSON and forms, recognises +json types", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(tryParseJson("{nope").ok).toBe(false);
    expect(isJsonType("application/vnd.api+json; charset=utf-8")).toBe(true);
    expect(decodeForm("a=1&b=hello+world&c=%26")).toEqual([
      ["a", "1"],
      ["b", "hello world"],
      ["c", "&"],
    ]);
  });

  it("renders a hex dump", () => {
    expect(hexDump(new Uint8Array([0x48, 0x69, 0x00]))).toBe(`00000000  48 69 00${" ".repeat(39)}  Hi.`);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-01-01T00:10:00Z");
    expect(relativeTime("2026-01-01T00:09:58Z", now)).toBe("just now");
    expect(relativeTime("2026-01-01T00:09:00Z", now)).toBe("1m ago");
    expect(relativeTime("2025-12-31T22:10:00Z", now)).toBe("2h ago");
  });
});

describe("copy as cURL", () => {
  const base = {
    captureUrl: "https://hp.example/h/abc",
    method: "POST",
    path: "/orders",
    query: "token=s3cret&page=1",
    headers: [
      ["host", "hp.example"],
      ["content-type", "application/json"],
      ["authorization", "Bearer sk_live_123"],
      ["x-forwarded-for", "1.2.3.4"],
    ] as [string, string][],
    bodyText: `{"msg":"it's"}`,
    bodySize: 14,
    truncated: false,
  };

  it("targets the capture URL, skips hop headers and masks secrets by default", () => {
    const c = buildCurl(base);
    expect(c).toContain("curl -X POST 'https://hp.example/h/abc/orders?token=");
    expect(c).not.toContain("s3cret");
    expect(c).not.toContain("sk_live_123");
    expect(c).toContain(`authorization: Bearer ${MASK}`);
    expect(c).not.toContain("x-forwarded-for");
    expect(c).not.toMatch(/'host:/);
    expect(c).toContain(`--data-binary '{"msg":"it'\\''s"}'`);
  });

  it("includes secrets only when revealed", () => {
    const c = buildCurl({ ...base, revealSecrets: true });
    expect(c).toContain("Bearer sk_live_123");
    expect(c).toContain("token=s3cret");
  });

  it("notes binary and truncated bodies", () => {
    const c = buildCurl({ ...base, bodyText: null, truncated: true });
    expect(c).toContain("@body.bin");
    expect(c).toContain("truncated");
  });

  it("quotes safely", () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
  });
});
