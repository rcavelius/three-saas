import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { safeDeliver, sanitizeDeliverHeaders, MAX_DELIVER_BODY_BYTES } from "./deliver";
import { SafeFetchError } from "./errors";
import { createLoopbackTestPolicy, staticResolver } from "./testing";

let server: http.Server;
let port = 0;
let hits: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
const policy = createLoopbackTestPolicy();
const HOST = "hooks.example.com";
const base = () => `http://${HOST}:${port}`;
const resolver = staticResolver({
  [HOST]: ["127.0.0.1"],
  "rebind.example.com": ["127.0.0.1", "10.0.0.5"],
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      hits.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString() });
      const p = new URL(req.url ?? "/", "http://x").pathname;
      if (p === "/redirect-private") {
        res.writeHead(307, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (p === "/big") {
        res.writeHead(200, { "content-type": "text/plain", "set-cookie": "s=1" });
        res.end("x".repeat(200 * 1024));
      } else {
        res.writeHead(202, { "content-type": "application/json", "set-cookie": "session=abc" });
        res.end(JSON.stringify({ received: true }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const opts = { policy, resolver };

describe("safeDeliver", () => {
  it("replays a POST with body and allowed headers", async () => {
    hits = [];
    const r = await safeDeliver(`${base()}/webhook`, {
      ...opts,
      method: "POST",
      headers: [
        ["content-type", "application/json"],
        ["x-signature", "abc123"],
        ["cookie", "stolen=1"],
        ["x-forwarded-for", "10.0.0.1"],
        ["host", "internal.local"],
        ["proxy-authorization", "Basic x"],
      ],
      body: '{"a":1}',
    });
    expect(r.status).toBe(202);
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect(r.droppedHeaders.sort()).toEqual(["cookie", "host", "proxy-authorization", "x-forwarded-for"]);
    const hit = hits[0]!;
    expect(hit.method).toBe("POST");
    expect(hit.body).toBe('{"a":1}');
    expect(hit.headers["x-signature"]).toBe("abc123");
    expect(hit.headers.cookie).toBeUndefined();
    expect(hit.headers["x-forwarded-for"]).toBeUndefined();
    expect(hit.headers.host).toBe(`${HOST}:${port}`);
  });

  it("does not follow redirects (returns the 3xx, never contacts the Location)", async () => {
    const r = await safeDeliver(`${base()}/redirect-private`, { ...opts, method: "POST", body: "x" });
    expect(r.status).toBe(307);
    expect(r.headers.location).toContain("169.254.169.254");
  });

  it("truncates large responses", async () => {
    const r = await safeDeliver(`${base()}/big`, { ...opts, method: "GET" });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(64 * 1024);
  });

  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://0x7f000001/",
    "http://localhost/",
    "file:///etc/passwd",
    "gopher://example.com/",
    "http://example.com:6379/",
  ])("refuses %s with the production policy", async (url) => {
    await expect(safeDeliver(url, { method: "POST", body: "x" })).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("refuses hosts where any DNS answer is private (rebinding)", async () => {
    await expect(safeDeliver("http://rebind.example.com/", { ...opts, method: "POST" })).rejects.toMatchObject({
      code: "BLOCKED_ADDRESS",
    });
  });

  it("refuses disallowed methods, GET bodies and oversized bodies", async () => {
    await expect(safeDeliver(`${base()}/`, { ...opts, method: "CONNECT" as never })).rejects.toMatchObject({
      code: "BLOCKED_METHOD",
    });
    await expect(safeDeliver(`${base()}/`, { ...opts, method: "GET", body: "x" })).rejects.toMatchObject({
      code: "BLOCKED_METHOD",
    });
    await expect(
      safeDeliver(`${base()}/`, { ...opts, method: "POST", body: Buffer.alloc(MAX_DELIVER_BODY_BYTES + 1) }),
    ).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
  });

  it("rejects header injection and hand-built policies", async () => {
    expect(() => sanitizeDeliverHeaders([["x-a", "1\r\nhost: evil"]])).toThrow(SafeFetchError);
    expect(() => sanitizeDeliverHeaders([["bad name", "1"]])).toThrow(SafeFetchError);
    expect(() => sanitizeDeliverHeaders(Array.from({ length: 51 }, (_, i) => [`x-${i}`, "1"] as [string, string]))).toThrow();
    await expect(
      safeDeliver(`${base()}/`, {
        method: "POST",
        resolver,
        policy: { name: "evil", allowAddress: () => true, allowPort: () => true },
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_POLICY" });
  });
});
