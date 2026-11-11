import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SafeFetchError, type SafeResponse } from "@repo/security";
import { clientBucket, createScanHandler, normalizeInputUrl, ScanSlots, type ScanHandlerOptions } from "./scan-handler";
import { openDb } from "./db";
import { getScan, SCAN_ID_PATTERN } from "./scans-repo";
import type { ScanDeps } from "./scanner/types";

type Handle = Awaited<ReturnType<typeof openDb>>;
let db: Handle;

beforeAll(async () => {
  db = await openDb("pglite:memory");
});
afterAll(async () => {
  await db.close();
});

/** Canned network: "/" is a small HTML page, everything else 404. No real sockets. */
function stubDeps(opts: { blocked?: boolean } = {}): ScanDeps {
  return {
    fetch: async (url) => {
      if (opts.blocked) throw new SafeFetchError("BLOCKED_ADDRESS", `${new URL(url).hostname} resolves to a non-public address`);
      const path = new URL(url).pathname;
      const body = Buffer.from(path === "/" ? "<html><head><title>Stub home page</title></head><body><a href='/x'>x</a></body></html>" : "nope");
      const res: SafeResponse = {
        url,
        status: path === "/" ? 200 : 404,
        headers: { "content-type": "text/html" },
        body,
        truncated: false,
        redirects: [],
        address: "93.184.215.14",
        elapsedMs: 1,
        text: () => body.toString("utf8"),
      };
      return res;
    },
    inspectTls: async () => ({ valid: true, daysRemaining: 90, address: "93.184.215.14", issuer: "Test CA" }),
  };
}

function handler(overrides: Partial<ScanHandlerOptions> = {}) {
  return createScanHandler({
    getExecutor: async () => db.executor,
    scanDeps: () => stubDeps(),
    slots: new ScanSlots(4),
    ipLimitPerHour: 100,
    targetLimitPerHour: 100,
    retentionDays: 90,
    clientIp: { mode: "xff", trustedHops: 1 },
    appUrl: "http://localhost:3001",
    scanOptions: { limits: { delayMs: 0, timeBudgetMs: 10_000 } },
    ...overrides,
  });
}

let ipCounter = 0;
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3001/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3001", "x-forwarded-for": `203.0.113.${++ipCounter}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("input helpers", () => {
  it("normalizes bare domains to https", () => {
    expect(normalizeInputUrl("example.com")).toBe("https://example.com");
    expect(normalizeInputUrl("example.com:8080/x")).toBe("https://example.com:8080/x");
    expect(normalizeInputUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeInputUrl("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
  it("buckets clients by the TRUSTED_PROXY header only (spoofed left-most X-Forwarded-For is ignored)", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 198.51.100.7", "fly-client-ip": "1.2.3.4" });
    expect(clientBucket(h, { mode: "none" })).toBe("ip:unknown");
    expect(clientBucket(h, { mode: "xff", trustedHops: 1 })).toBe("ip4:198.51.100.7");
    expect(clientBucket(h, { mode: "fly" })).toBe("ip4:1.2.3.4");
    // a client prepending addresses cannot change its bucket
    const spoofed = new Headers({ "x-forwarded-for": "10.0.0.1, 9.9.9.9, 198.51.100.7" });
    expect(clientBucket(spoofed, { mode: "xff", trustedHops: 1 })).toBe("ip4:198.51.100.7");
  });
});

describe("POST /api/scan", () => {
  it.each([
    [{ url: "" }, 400],
    [{ url: "http://localhost/" }, 400],
    [{ url: "http://169.254.169.254/latest/meta-data/" }, 400],
    [{ url: "http://[::1]/" }, 400],
    [{ url: "http://2130706433/" }, 400],
    [{ url: "file:///etc/passwd" }, 400],
    [{ url: "https://example.com:8443/" }, 400],
    [{ url: "https://user:pw@example.com/" }, 400],
    [{ nope: 1 }, 400],
    ["not json", 400],
  ])("rejects %j with %i", async (body, status) => {
    const res = await handler()(post(body));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBeTruthy();
  });

  it("rejects non-JSON content types, oversized bodies and cross-origin posts", async () => {
    const h = handler();
    const form = new Request("http://localhost:3001/api/scan", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "url=x" });
    expect((await h(form)).status).toBe(415);
    expect((await h(post({ url: "https://example.com/" + "a".repeat(5000) }))).status).toBe(413);
    expect((await h(post({ url: "https://example.com/" }, { origin: "https://evil.example" }))).status).toBe(403);
  });

  it("scans, stores the report under an unguessable id, and returns JSON", async () => {
    const res = await handler()(post({ url: "stub-target.example.com" }, { origin: "http://localhost:3001" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; reportUrl: string; report: { startUrl: string; issues: { id: string }[] } };
    expect(data.id).toMatch(SCAN_ID_PATTERN);
    expect(data.reportUrl).toBe(`/report/${data.id}`);
    expect(data.report.startUrl).toBe("https://stub-target.example.com/");
    expect(data.report.issues.some((i) => i.id === "internal-link-broken")).toBe(true);
    const stored = await getScan(db.executor, data.id);
    expect(stored?.report.startUrl).toBe("https://stub-target.example.com/");
    expect(await getScan(db.executor, "A".repeat(22))).toBeNull();
    expect(await getScan(db.executor, "../etc")).toBeNull();
  });

  it("streams NDJSON progress and the result", async () => {
    const res = await handler()(post({ url: "https://stream.example.com" }, { accept: "application/x-ndjson" }));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as { type: string; id?: string });
    expect(lines[0]!.type).toBe("accepted");
    expect(lines.some((l) => l.type === "progress")).toBe(true);
    const last = lines[lines.length - 1]!;
    expect(last.type).toBe("result");
    expect(last.id).toMatch(SCAN_ID_PATTERN);
  });

  it("rate-limits per client IP", async () => {
    const h = handler({ ipLimitPerHour: 2 });
    const ip = { "x-forwarded-for": "198.51.100.99" };
    expect((await h(post({ url: "https://rl1.example.com" }, ip))).status).toBe(200);
    expect((await h(post({ url: "https://rl2.example.com" }, ip))).status).toBe(200);
    const third = await h(post({ url: "https://rl3.example.com" }, ip));
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await h(post({ url: "https://rl4.example.com" }, { "x-forwarded-for": "198.51.100.100" }))).status).toBe(200);
  });

  it("rate-limits per target host", async () => {
    const h = handler({ targetLimitPerHour: 1 });
    expect((await h(post({ url: "https://popular.example.com" }))).status).toBe(200);
    expect((await h(post({ url: "https://popular.example.com/other" }))).status).toBe(429);
  });

  it("returns 503 when all scan slots are busy", async () => {
    const slots = new ScanSlots(1);
    const hold = slots.tryAcquire();
    expect((await handler({ slots })(post({ url: "https://busy.example.com" }))).status).toBe(503);
    hold?.();
    expect(slots.inUse).toBe(0);
  });

  it("refuses (and does not store) a host whose DNS points at a private network", async () => {
    const before = await db.executor.query<{ n: number }>("SELECT count(*)::int AS n FROM scans");
    const res = await handler({ scanDeps: () => stubDeps({ blocked: true }) })(post({ url: "https://rebind.example.com" }));
    expect(res.status).toBe(400);
    const after = await db.executor.query<{ n: number }>("SELECT count(*)::int AS n FROM scans");
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});
