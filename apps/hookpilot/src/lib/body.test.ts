import { describe, expect, it } from "vitest";
import { readBodyCapped } from "./body";

function streamOf(chunks: Uint8Array[]) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]!);
      else c.close();
    },
  });
}

const req = (body: ReadableStream<Uint8Array> | string | null, headers: Record<string, string> = {}) =>
  new Request("http://x/", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("readBodyCapped", () => {
  it("returns small bodies intact", async () => {
    const r = await readBodyCapped(req("hello"), 10, 20);
    expect(r).toMatchObject({ kind: "ok", size: 5, truncated: false });
    if (r.kind === "ok") expect(new TextDecoder().decode(r.body)).toBe("hello");
  });

  it("keeps only storeCap bytes across chunk boundaries", async () => {
    const enc = new TextEncoder();
    const r = await readBodyCapped(req(streamOf([enc.encode("abcd"), enc.encode("efgh"), enc.encode("ij")])), 6, 100);
    expect(r).toMatchObject({ kind: "ok", size: 10, truncated: true });
    if (r.kind === "ok") expect(new TextDecoder().decode(r.body)).toBe("abcdef");
  });

  it("rejects from a declared Content-Length without reading", async () => {
    const r = await readBodyCapped(req("x".repeat(30), { "content-length": "30" }), 10, 20);
    expect(r).toEqual({ kind: "too_large", size: 30 });
  });

  it("rejects while streaming once the hard cap is crossed", async () => {
    const r = await readBodyCapped(req(streamOf([new Uint8Array(15), new Uint8Array(15), new Uint8Array(15)])), 10, 20);
    expect(r).toEqual({ kind: "too_large", size: 30 });
  });

  it("handles a missing body", async () => {
    const r = await readBodyCapped(new Request("http://x/"), 10, 20);
    expect(r).toMatchObject({ kind: "ok", size: 0, truncated: false });
  });
});
