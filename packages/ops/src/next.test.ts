import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { DbHandle } from "@repo/database";
import { buildCsp, cronTickRoute, cspProxy, generateNonce, healthRoute, verifyCronRequest } from "./next";
import { createScheduler } from "./scheduler";
import { writeHeartbeat } from "./state";
import { makeClock, makeDb } from "./test/fixtures";

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";
const directives = (csp: string) => Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0]!, d]));

describe("buildCsp", () => {
  it("is strict in production", () => {
    const d = directives(buildCsp(NONCE));
    expect(d["script-src"]).toBe(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(d["style-src"]).toBe("style-src 'self' 'unsafe-inline'");
    expect(d["object-src"]).toBe("object-src 'none'");
    expect(d["base-uri"]).toBe("base-uri 'none'");
    expect(d["form-action"]).toBe("form-action 'self'");
    expect(d["frame-ancestors"]).toBe("frame-ancestors 'none'");
    expect(d["upgrade-insecure-requests"]).toBe("upgrade-insecure-requests");
    expect(buildCsp(NONCE)).not.toContain("unsafe-eval");
  });

  it("adds 'unsafe-eval' only in dev, and drops upgrade-insecure-requests", () => {
    const dev = buildCsp(NONCE, { dev: true });
    expect(directives(dev)["script-src"]).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(buildCsp(NONCE, { dev: false })).not.toContain("unsafe-eval");
  });

  it("adds extra sources but refuses directive injection", () => {
    const csp = buildCsp(NONCE, {
      connectSrc: ["https://api.stripe.com", "https://x; script-src *", "'unsafe-inline'", "*"],
      imgSrc: ["https://cdn.example"],
      frameAncestors: ["https://partner.example"],
    });
    const d = directives(csp);
    expect(d["connect-src"]).toBe("connect-src 'self' https://api.stripe.com");
    expect(d["img-src"]).toBe("img-src 'self' data: blob: https://cdn.example");
    expect(d["frame-ancestors"]).toBe("frame-ancestors https://partner.example");
    expect(csp.match(/script-src/g)).toHaveLength(1);
  });

  it("rejects weak or malformed nonces", () => {
    expect(() => buildCsp("short")).toThrow();
    expect(() => buildCsp("abc' 'unsafe-inline")).toThrow();
  });
});

describe("cspProxy", () => {
  it("sets a unique 128-bit nonce per request on the forwarded request and the response", () => {
    const proxy = cspProxy({});
    const nonces = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = proxy(new NextRequest("https://app.example/", { headers: { "x-nonce": "attacker" } }));
      const csp = res.headers.get("content-security-policy")!;
      const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
      expect(Buffer.from(nonce, "base64")).toHaveLength(16);
      nonces.add(nonce);
      // Forwarded request headers are carried via x-middleware-override-headers / x-middleware-request-*.
      expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
      expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
      expect(res.headers.get("x-middleware-override-headers")).toContain("x-nonce");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("permissions-policy")).toContain("camera=()");
      expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    }
    expect(nonces.size).toBe(20);
  });

  it("omits HSTS in dev", () => {
    const res = cspProxy({ dev: true })(new NextRequest("http://localhost:3001/"));
    expect(res.headers.get("strict-transport-security")).toBeNull();
    expect(res.headers.get("content-security-policy")).toContain("'unsafe-eval'");
  });

  it("generateNonce is base64 of 16 random bytes", () => {
    const n = generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(n);
  });
});

describe("verifyCronRequest", () => {
  const SECRET = "cron-secret-0123456789abcdef";
  const req = (auth?: string) => new Request("https://app.example/api/cron/tick", { headers: auth ? { authorization: auth } : {} });

  it("accepts only the exact bearer token", () => {
    expect(verifyCronRequest(req(`Bearer ${SECRET}`), SECRET)).toBe(true);
    expect(verifyCronRequest(req(`bearer ${SECRET}`), SECRET)).toBe(true);
    expect(verifyCronRequest(req(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(verifyCronRequest(req(`Bearer ${SECRET.slice(0, -1)}`), SECRET)).toBe(false);
    expect(verifyCronRequest(req(`Basic ${SECRET}`), SECRET)).toBe(false);
    expect(verifyCronRequest(req(SECRET), SECRET)).toBe(false);
    expect(verifyCronRequest(req(`Bearer  ${SECRET}`), SECRET)).toBe(false);
    expect(verifyCronRequest(req(`Bearer ${SECRET} extra`), SECRET)).toBe(false);
    expect(verifyCronRequest(req("Bearer "), SECRET)).toBe(false);
    expect(verifyCronRequest(req(), SECRET)).toBe(false);
  });

  it("is false when the secret is unset or too short, even if the header matches", () => {
    expect(verifyCronRequest(req("Bearer "), "")).toBe(false);
    expect(verifyCronRequest(req("Bearer undefined"), undefined)).toBe(false);
    expect(verifyCronRequest(req("Bearer short"), "short")).toBe(false);
  });
});

describe("route factories", () => {
  let handle: DbHandle<any>;
  beforeAll(async () => {
    handle = await makeDb({ withAuthBilling: false });
  });
  afterAll(async () => {
    await handle.close();
  });
  const SECRET = "cron-secret-0123456789abcdef";

  it("cronTickRoute: 503 without secret, 401 on bad token, 200 runs a tick", async () => {
    const clock = makeClock("2026-10-01T00:00:00Z");
    let ran = 0;
    const scheduler = createScheduler({
      handle,
      jobs: { hello: async () => void ran++ },
      schedules: [{ name: "hello", intervalSeconds: 60 }],
      now: clock,
    });
    const r = (auth?: string) =>
      new Request("https://app.example/api/cron/tick", { method: "POST", headers: auth ? { authorization: auth } : {} });
    expect((await cronTickRoute({ scheduler, secret: undefined })(r(`Bearer ${SECRET}`))).status).toBe(503);
    expect((await cronTickRoute({ scheduler, secret: SECRET })(r("Bearer wrong"))).status).toBe(401);
    expect(ran).toBe(0);
    const res = await cronTickRoute({ scheduler, secret: SECRET })(r(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, enqueued: 1, ran: 1, succeeded: 1 });
    expect(ran).toBe(1);
  });

  it("healthRoute: public shape for anonymous callers, full report with the secret, 503 when down", async () => {
    const now = makeClock("2026-10-01T00:00:00Z");
    await writeHeartbeat(handle.executor, "scheduler", {}, now());
    const route = healthRoute({ handle, version: "abc123", detailsSecret: SECRET, now });
    const anon = await route(new Request("https://app.example/api/health"));
    expect(anon.status).toBe(200);
    expect(await anon.json()).toEqual({ status: "ok", version: "abc123" });
    const full = await route(new Request("https://app.example/api/health", { headers: { authorization: `Bearer ${SECRET}` } }));
    const body = await full.json();
    expect(body.checks.db.ok).toBe(true);
    expect(body.version).toBe("abc123");

    const down = healthRoute({
      handle: { executor: { exec: async () => {}, query: async () => Promise.reject(new Error("db down")) } },
      version: "abc123",
    });
    const res = await down(new Request("https://app.example/api/health"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "down", version: "abc123" });
  });
});
