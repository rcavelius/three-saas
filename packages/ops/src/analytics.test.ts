import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@repo/database";
import { countryFromHeaders, deviceClass, isObviousBot, referrerHost, sanitizePath, sanitizeProps, sanitizeUtm, trackEvent, MAX_PROPS_BYTES } from "./analytics";
import { eventsRoute } from "./next";
import { makeClock, makeDb } from "./test/fixtures";

let handle: DbHandle<any>;
const ex = () => handle.executor;
const rows = async () =>
  (
    await ex().query<{ name: string; anonymous_id: string | null; user_id: string | null; path: string | null; props: Record<string, unknown> }>(
      `SELECT name, anonymous_id, user_id, path, props FROM analytics_events ORDER BY created_at, id`,
    )
  ).rows;

beforeAll(async () => {
  handle = await makeDb({ withAuthBilling: false });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await ex().exec(`DELETE FROM analytics_events; DELETE FROM rate_limits;`);
});

describe("trackEvent", () => {
  it("stores allow-listed events and rejects everything else", async () => {
    expect(await trackEvent(ex(), { name: "pageview", anonymousId: "anon_12345678", path: "/pricing" })).toEqual({ stored: true });
    expect(await trackEvent(ex(), { name: "drop_table" })).toEqual({ stored: false, reason: "name_not_allowed" });
    expect(await trackEvent(ex(), { name: "custom" }, { allowedNames: ["custom"] })).toEqual({ stored: true });
    expect((await rows()).map((r) => r.name)).toEqual(["pageview", "custom"]);
  });

  it("strips PII from props and paths and rejects malformed anonymous ids", async () => {
    await trackEvent(ex(), {
      name: "tool_used",
      anonymousId: "bad id with spaces",
      path: "/u/jane%40example.com/settings?token=abc&email=jane@example.com#frag",
      props: {
        tool: "csv-dedupe",
        rows: 120,
        ok: true,
        email: "x@y.example",
        contact: "reach me at jane@example.com",
        client: "203.0.113.5",
        v6: "2001:db8::1",
        nested: { a: 1 },
        list: [1, 2],
        "bad key": 1,
        phone_number: "123",
        inf: Infinity,
        version: "1.2.3",
        time: "12:30:45",
      },
    });
    const [r] = await rows();
    expect(r!.anonymous_id).toBeNull();
    expect(r!.path).toBe("/u/:redacted/settings");
    expect(r!.props).toEqual({ tool: "csv-dedupe", rows: 120, ok: true, version: "1.2.3", time: "12:30:45" });
  });

  it("caps prop count, string length and total size", () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeProps(many))).toHaveLength(20);
    expect((sanitizeProps({ s: "x".repeat(1000) }).s as string).length).toBe(200);
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, "y".repeat(190)]));
    expect(Buffer.byteLength(JSON.stringify(sanitizeProps(big)))).toBeLessThanOrEqual(MAX_PROPS_BYTES);
    expect(sanitizeProps(null)).toEqual({});
    expect(sanitizeProps([1, 2] as never)).toEqual({});
  });

  it("sanitizePath keeps only a pathname", () => {
    expect(sanitizePath("https://evil.example/a/b?x=1")).toBe("/a/b");
    expect(sanitizePath("/reset/10.0.0.1")).toBe("/reset/:redacted");
    expect(sanitizePath(null)).toBeNull();
  });
});

describe("eventsRoute", () => {
  const clock = makeClock("2026-09-01T00:00:00Z");
  // Built per call because `handle` is only assigned in beforeAll.
  const route = (req: Request) =>
    eventsRoute({
      handle,
      rateLimit: { limit: 3, windowMs: 60_000 },
      clientIp: { mode: "fly" },
      now: clock,
      getUserId: async () => "user_server_side",
    })(req);
  const post = (body: unknown, headers: Record<string, string> = {}, url = "https://app.example/api/events") =>
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.example", "fly-client-ip": "198.51.100.1", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("accepts a same-origin beacon and ignores a client-supplied userId", async () => {
    const res = await route(post({ name: "pageview", anonymousId: "anon_12345678", path: "/", userId: "spoofed" }));
    expect(res.status).toBe(204);
    const [r] = await rows();
    expect(r).toMatchObject({ name: "pageview", user_id: "user_server_side", anonymous_id: "anon_12345678" });
  });

  it("rejects cross-origin, missing-origin and opaque-origin requests", async () => {
    expect((await route(post({ name: "pageview" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await route(post({ name: "pageview" }, { origin: "null" }))).status).toBe(403);
    const noOrigin = new Request("https://app.example/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "pageview" }),
    });
    expect((await route(noOrigin)).status).toBe(403);
    const sameSiteFetch = new Request("https://app.example/api/events", {
      method: "POST",
      headers: { "content-type": "text/plain", "sec-fetch-site": "same-origin", "fly-client-ip": "198.51.100.77" },
      body: JSON.stringify({ name: "pageview" }),
    });
    expect((await route(sameSiteFetch)).status).toBe(204);
    expect(await rows()).toHaveLength(1);
  });

  it("rejects disallowed names, bad JSON, wrong methods, content types and oversized bodies", async () => {
    expect((await route(post({ name: "admin_delete" }, { "fly-client-ip": "198.51.100.2" }))).status).toBe(400);
    expect((await route(post("{not json", { "fly-client-ip": "198.51.100.3" }))).status).toBe(400);
    expect((await route(post({ name: "pageview" }, { "content-type": "application/x-www-form-urlencoded" }))).status).toBe(415);
    expect((await route(new Request("https://app.example/api/events", { method: "GET" }))).status).toBe(405);
    expect(
      (await route(post({ name: "pageview", props: { a: "x".repeat(5000) } }, { "fly-client-ip": "198.51.100.4" }))).status,
    ).toBe(413);
    expect(await rows()).toHaveLength(0);
  });

  it("rate limits per client IP (spoofed X-Forwarded-For does not get a fresh bucket)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await route(post({ name: "pageview" }, { "fly-client-ip": "203.0.113.50", "x-forwarded-for": `10.0.0.${i}` }));
      statuses.push(res.status);
      if (res.status === 429) expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    }
    expect(statuses).toEqual([204, 204, 204, 429, 429]);
    // A different client is unaffected.
    expect((await route(post({ name: "pageview" }, { "fly-client-ip": "203.0.113.51" }))).status).toBe(204);
    // Next window: allowed again.
    clock.advance(60_000);
    expect((await route(post({ name: "pageview" }, { "fly-client-ip": "203.0.113.50" }))).status).toBe(204);
  });

  it("honours an explicit allowedOrigins list", async () => {
    const r2 = eventsRoute({ handle, rateLimit: { limit: 100, windowMs: 60_000 }, clientIp: { mode: "none" }, allowedOrigins: ["https://www.app.example/"] });
    expect((await r2(post({ name: "pageview" }, { origin: "https://www.app.example" }))).status).toBe(204);
    expect((await r2(post({ name: "pageview" }))).status).toBe(403);
  });
});

describe("visit sources", () => {
  const CHROME_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

  it("referrerHost keeps only the host and drops self, IP and junk referrers", () => {
    expect(referrerHost("https://www.google.com/search?q=clean+csv&email=a@b.example")).toBe("google.com");
    expect(referrerHost("https://news.ycombinator.com/item?id=1")).toBe("news.ycombinator.com");
    expect(referrerHost("https://m.facebook.com/")).toBe("facebook.com");
    expect(referrerHost("https://gridrinse.com/tools", ["gridrinse.com"])).toBeNull();
    expect(referrerHost("https://www.gridrinse.com/", ["gridrinse.com"])).toBeNull();
    expect(referrerHost("http://203.0.113.9/page")).toBeNull();
    expect(referrerHost("http://[2001:db8::1]/")).toBeNull();
    expect(referrerHost("javascript:alert(1)")).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
    expect(referrerHost("")).toBeNull();
    expect(referrerHost(42)).toBeNull();
    expect(referrerHost("android-app://com.google.android.gm/")).toBe("android-app:com.google.android.gm");
  });

  it("sanitizeUtm keeps short lowercase tokens and drops anything personal", () => {
    expect(sanitizeUtm("Newsletter")).toBe("newsletter");
    expect(sanitizeUtm("launch_2026-11")).toBe("launch_2026-11");
    expect(sanitizeUtm("jane@example.com")).toBeNull();
    expect(sanitizeUtm("<script>")).toBeNull();
    expect(sanitizeUtm("x".repeat(500))).toHaveLength(64);
    expect(sanitizeUtm(null)).toBeNull();
  });

  it("country, device and bot detection", () => {
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "de" }))).toBe("DE");
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "Germany" }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
    expect(deviceClass(IPHONE)).toBe("mobile");
    expect(deviceClass(CHROME_DESKTOP)).toBe("desktop");
    expect(deviceClass(null)).toBeNull();
    expect(isObviousBot(GOOGLEBOT)).toBe(true);
    expect(isObviousBot("curl/8.4.0")).toBe(true);
    expect(isObviousBot("Mozilla/5.0 HeadlessChrome/120.0")).toBe(true);
    expect(isObviousBot(null)).toBe(true);
    expect(isObviousBot(CHROME_DESKTOP)).toBe(false);
    expect(isObviousBot(IPHONE)).toBe(false);
  });

  it("eventsRoute stores referrer host, utm, country, device and bot flag, never the IP or full URL", async () => {
    const route = eventsRoute({ handle, rateLimit: { limit: 100, windowMs: 60_000 }, clientIp: { mode: "fly" }, allowedOrigins: ["https://app.example"] });
    const send = (body: unknown, ua: string, country?: string) =>
      route(
        new Request("https://app.example/api/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://app.example",
            "fly-client-ip": "198.51.100.20",
            "user-agent": ua,
            ...(country ? { "cf-ipcountry": country } : {}),
          },
          body: JSON.stringify(body),
        }),
      );
    expect(
      (
        await send(
          {
            name: "pageview",
            anonymousId: "anon_12345678",
            path: "/tools/x",
            referrer: "https://www.google.com/search?q=secret-query",
            utm: { source: "Reddit", medium: "social", campaign: "launch", term: "ignored" },
            landing: true,
          },
          IPHONE,
          "nl",
        )
      ).status,
    ).toBe(204);
    expect((await send({ name: "pageview", path: "/", referrer: "https://app.example/pricing" }, GOOGLEBOT)).status).toBe(204);
    const { rows: stored } = await handle.executor.query<Record<string, unknown>>(
      `SELECT * FROM analytics_events WHERE name = 'pageview' ORDER BY is_bot`,
    );
    expect(stored[0]).toMatchObject({
      referrer_host: "google.com",
      utm_source: "reddit",
      utm_medium: "social",
      utm_campaign: "launch",
      country: "NL",
      device: "mobile",
      is_bot: false,
      is_landing: true,
    });
    expect(stored[1]).toMatchObject({ referrer_host: null, utm_source: null, country: null, device: "desktop", is_bot: true, is_landing: false });
    const dump = JSON.stringify(stored);
    expect(dump).not.toContain("198.51.100.20");
    expect(dump).not.toContain("secret-query");
    expect(dump).not.toContain("iPhone");
  });

  it("trackEvent re-sanitizes a source passed in directly", async () => {
    await trackEvent(ex(), {
      name: "pageview",
      source: { referrerHost: "https://evil.example/path?email=a@b.example", utmSource: "a@b.example", country: "Narnia", device: "fridge" as never, isBot: "yes" as never },
    });
    const { rows: stored } = await handle.executor.query<Record<string, unknown>>(`SELECT * FROM analytics_events`);
    expect(stored[0]).toMatchObject({ referrer_host: null, utm_source: null, country: null, device: null, is_bot: false });
  });
});

describe("eventsRoute allowedProps", () => {
  it("keeps only allowlisted primitive props for listed events", async () => {
    const route = eventsRoute({
      handle,
      rateLimit: { limit: 100, windowMs: 60_000 },
      clientIp: { mode: "fly" },
      allowedProps: { tool_used: ["rows", "steps"] },
    });
    const res = await route(
      new Request("https://app.example/api/events", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.example", "fly-client-ip": "198.51.100.9" },
        body: JSON.stringify({
          name: "tool_used",
          props: { rows: 120, steps: "trim,dedupe", fileName: "customers.csv", cell: "secret", nested: { a: 1 } },
        }),
      }),
    );
    expect(res.status).toBe(204);
    const { rows } = await handle.executor.query<{ props: Record<string, unknown> }>(
      `SELECT props FROM analytics_events WHERE name = 'tool_used' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows[0]?.props).toEqual({ rows: 120, steps: "trim,dedupe" });
  });
});
