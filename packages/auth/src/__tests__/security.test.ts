import { describe, it, expect, afterAll } from "vitest";
import { setup, PASSWORD, type TestCtx, type Jar } from "./helpers";
import { createDb } from "@repo/database";
import { createAuth } from "../auth";

const open: TestCtx[] = [];
async function fresh(over: Parameters<typeof setup>[0] = {}) {
  const t = await setup(over);
  open.push(t);
  return t;
}
afterAll(async () => {
  for (const t of open) await t.close();
});

function sessionCookie(res: Response): string {
  const c = res.headers.getSetCookie().find((l) => l.includes("session_token="));
  if (!c) throw new Error("no session cookie");
  return c;
}

describe("session cookie flags", () => {
  it("dev: HttpOnly, SameSite=Lax, Path=/, per-app prefix, 30-day Max-Age, not Secure", async () => {
    const t = await fresh();
    await t.verifiedUser("c@example.com");
    const { res } = await t.signIn("c@example.com");
    const c = sessionCookie(res);
    expect(c).toMatch(/^tp\.session_token=/);
    expect(c).toMatch(/;\s*HttpOnly/i);
    expect(c).toMatch(/;\s*SameSite=Lax/i);
    expect(c).toMatch(/;\s*Path=\//i);
    expect(c).toMatch(/;\s*Max-Age=2592000/i);
    expect(c).not.toMatch(/;\s*Secure/i);
  });

  it("production: Secure and __Secure- prefixed", async () => {
    const t = await fresh({ baseURL: "https://app.example.com" });
    const r = await t.call("https://app.example.com/api/auth/sign-up/email", {
      body: { email: "p@example.com", password: PASSWORD, name: "P" },
      origin: "https://app.example.com",
    });
    expect(r.status).toBe(200);
    const link = t.linkIn(t.lastEmail("p@example.com", "auth.verify-email"));
    expect(link.startsWith("https://app.example.com/api/auth/verify-email")).toBe(true);
    await t.call(link, { origin: null });
    const res = await t.call("https://app.example.com/api/auth/sign-in/email", {
      body: { email: "p@example.com", password: PASSWORD },
      origin: "https://app.example.com",
    });
    expect(res.status).toBe(200);
    const c = sessionCookie(res);
    expect(c).toMatch(/^__Secure-tp\.session_token=/);
    expect(c).toMatch(/;\s*Secure/i);
    expect(c).toMatch(/;\s*HttpOnly/i);
    expect(c).toMatch(/;\s*SameSite=Lax/i);
  });

  it("explicit secureCookies flag is honoured", async () => {
    const t = await fresh({ secureCookies: true });
    await t.signUp("s@example.com");
    await t.call(t.linkIn(t.lastEmail("s@example.com", "auth.verify-email")), { origin: null });
    const { res } = await t.signIn("s@example.com");
    expect(sessionCookie(res)).toMatch(/;\s*Secure/i);
  });
});

describe("origin / CSRF", () => {
  it("rejects a cross-origin POST to sign-in", async () => {
    const t = await fresh();
    await t.verifiedUser("o@example.com");
    const jar: Jar = new Map();
    const res = await t.call("/sign-in/email", {
      body: { email: "o@example.com", password: PASSWORD },
      origin: "https://evil.example",
      jar,
    });
    expect(res.status).toBe(403);
    expect(jar.size).toBe(0);
  });

  it("rejects a cross-site navigation (form) login", async () => {
    const t = await fresh();
    await t.verifiedUser("n@example.com");
    const res = await t.call("/sign-in/email", {
      body: { email: "n@example.com", password: PASSWORD },
      origin: null,
      headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects cookie-authenticated POSTs from a foreign or missing origin", async () => {
    const t = await fresh();
    const { jar } = await t.verifiedUser("csrf@example.com");
    const evil = await t.call("/organization/create", { body: { name: "Evil", slug: "evil" }, jar, origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const none = await t.call("/organization/create", { body: { name: "Evil", slug: "evil2" }, jar, origin: null });
    expect(none.status).toBe(403);
    const del = await t.call("/delete-user", { body: { password: PASSWORD }, jar, origin: "https://evil.example" });
    expect(del.status).toBe(403);
    const { rows } = await t.handle.executor.query(`SELECT 1 FROM auth_user WHERE email = 'csrf@example.com'`);
    expect(rows).toHaveLength(1);
  });

  it("accepts an explicitly trusted extra origin", async () => {
    const t = await fresh({ trustedOrigins: ["https://www.example.com"] });
    await t.verifiedUser("tr@example.com");
    const res = await t.call("/sign-in/email", { body: { email: "tr@example.com", password: PASSWORD }, origin: "https://www.example.com" });
    expect(res.status).toBe(200);
  });

  it("rejects an untrusted callbackURL on sign-up (no open redirect)", async () => {
    const t = await fresh();
    const res = await t.call("/sign-up/email", {
      body: { email: "cb@example.com", password: PASSWORD, name: "CB", callbackURL: "https://evil.example/x" },
    });
    expect(res.status).toBe(403);
  });
});

describe("rate limiting (database storage)", () => {
  it("sign-in returns 429 after 5 attempts per minute from one IP, other IPs unaffected", async () => {
    const t = await fresh();
    await t.verifiedUser("rl@example.com");
    const ip = "203.0.113.7";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await t.call("/sign-in/email", { body: { email: "rl@example.com", password: "wrong password!!" }, ip });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    // even the right password is blocked while limited
    const blocked = await t.call("/sign-in/email", { body: { email: "rl@example.com", password: PASSWORD }, ip });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("x-retry-after")).toBeTruthy();
    const other = await t.call("/sign-in/email", { body: { email: "rl@example.com", password: PASSWORD }, ip: "203.0.113.8" });
    expect(other.status).toBe(200);

    const { rows } = await t.handle.executor.query<{ key: string; count: number }>(
      `SELECT key, count FROM auth_rate_limit WHERE key LIKE '203.0.113.7|%'`,
    );
    expect(rows).toEqual([{ key: "203.0.113.7|/sign-in/email", count: 5 }]);
  });

  it("sign-up: 3 per minute per IP", async () => {
    const t = await fresh();
    const ip = "198.51.100.1";
    const s: number[] = [];
    for (let i = 0; i < 4; i++) {
      s.push((await t.call("/sign-up/email", { body: { email: `su${i}@example.com`, password: PASSWORD, name: "S" }, ip })).status);
    }
    expect(s).toEqual([200, 200, 200, 429]);
  });

  it("password reset and verification email requests: 3 per 5 minutes per IP", async () => {
    const t = await fresh();
    await t.verifiedUser("pr@example.com");
    const ip = "198.51.100.2";
    const reset: number[] = [];
    const verify: number[] = [];
    for (let i = 0; i < 4; i++) {
      reset.push((await t.call("/request-password-reset", { body: { email: "pr@example.com", redirectTo: "/r" }, ip })).status);
      verify.push((await t.call("/send-verification-email", { body: { email: "pr@example.com" }, ip })).status);
    }
    expect(reset).toEqual([200, 200, 200, 429]);
    expect(verify.slice(0, 3).every((s) => s < 429)).toBe(true);
    expect(verify[3]).toBe(429);
  });
});

describe("configuration guards", () => {
  it("refuses a short secret", () => {
    const handle = createDb("pglite:memory", {});
    expect(() =>
      createAuth({ handle, appName: "A", baseURL: "http://localhost", secret: "short", cookiePrefix: "a", sendEmail: async () => {} }),
    ).toThrow(/secret/);
    return handle.close();
  });
});
