import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setup, headersFor, PASSWORD, type TestCtx, type Jar } from "./helpers";

let t: TestCtx;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

describe("sign-up and email verification", () => {
  it("creates an unverified user, sends a verification email and no session", async () => {
    const res = await t.signUp("alice@example.com", "Alice <b>&</b>");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(false);

    const { rows } = await t.handle.executor.query<{ email_verified: boolean; role: string }>(
      `SELECT email_verified, role FROM auth_user WHERE email = $1`,
      ["alice@example.com"],
    );
    expect(rows[0]).toEqual({ email_verified: false, role: "customer" });

    const mail = t.lastEmail("alice@example.com", "auth.verify-email");
    expect(mail.subject).toContain("TestApp");
    expect(mail.text).toContain("/api/auth/verify-email?token=");
    // user-controlled name is escaped in HTML
    expect(mail.html).toContain("Alice &lt;b&gt;&amp;&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>&</b>");
    expect(mail.html).toContain('lang="en"');
  });

  it("blocks sign-in until the email is verified", async () => {
    const { res, jar } = await t.signIn("alice@example.com");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("EMAIL_NOT_VERIFIED");
    expect(jar.size).toBe(0);
  });

  it("rejects a tampered verification token", async () => {
    const link = t.linkIn(t.lastEmail("alice@example.com", "auth.verify-email"));
    const bad = link.replace(/token=([^&]+)/, (_m, tok: string) => `token=${tok.slice(0, -4)}AAAA`);
    const jar: Jar = new Map();
    await t.call(bad, { jar, origin: null });
    expect(await t.auth.getSession(headersFor(jar))).toBeNull();
    const { rows } = await t.handle.executor.query<{ email_verified: boolean }>(
      `SELECT email_verified FROM auth_user WHERE email = 'alice@example.com'`,
    );
    expect(rows[0]!.email_verified).toBe(false);
  });

  it("verification link verifies and signs the user in", async () => {
    const jar: Jar = new Map();
    const res = await t.call(t.linkIn(t.lastEmail("alice@example.com", "auth.verify-email")), { jar, origin: null });
    expect(res.status).toBeLessThan(400);
    const s = await t.auth.getSession(headersFor(jar));
    expect(s?.user.email).toBe("alice@example.com");
    expect(s?.user.emailVerified).toBe(true);
  });

  it("sign-in -> getSession -> sign-out", async () => {
    const { res, jar } = await t.signIn("alice@example.com");
    expect(res.status).toBe(200);
    const s = await t.auth.getSession(headersFor(jar));
    expect(s?.user.email).toBe("alice@example.com");
    expect((await t.auth.requireUser(headersFor(jar))).user.id).toBe(s!.user.id);

    const before = new Map(jar);
    const out = await t.call("/sign-out", { method: "POST", body: {}, jar });
    expect(out.status).toBe(200);
    expect(await t.auth.getSession(headersFor(jar))).toBeNull();
    // the old cookie value is dead server-side too (not just cleared in the browser)
    expect(await t.auth.getSession(headersFor(before))).toBeNull();
    await expect(t.auth.requireUser(headersFor(before))).rejects.toMatchObject({ status: 401 });
  });

  it("wrong password and unknown email fail the same way", async () => {
    const wrong = await t.signIn("alice@example.com", "not the password!!");
    const unknown = await t.signIn("nobody@example.com", PASSWORD);
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(await wrong.res.json()).toEqual(await unknown.res.json());
    expect(wrong.jar.size).toBe(0);
  });

  it("enforces password length 10..128", async () => {
    expect((await t.signUp("short@example.com", "S", "123456789")).status).toBe(400);
    expect((await t.signUp("long@example.com", "L", "x".repeat(129))).status).toBe(400);
    expect((await t.signUp("ok10@example.com", "O", "1234567890")).status).toBe(200);
  });

  it("duplicate sign-up does not reveal that the email exists", async () => {
    const res = await t.signUp("alice@example.com", "Someone Else");
    expect(res.status).toBe(200);
    const { rows } = await t.handle.executor.query(`SELECT 1 FROM auth_user WHERE email = 'alice@example.com'`);
    expect(rows).toHaveLength(1);
  });

  it("forged or garbage session cookies are rejected", async () => {
    expect(await t.auth.getSession(new Headers({ cookie: "tp.session_token=abc.def" }))).toBeNull();
    expect(await t.auth.getSession(new Headers())).toBeNull();
    // a raw DB token without the HMAC signature is not accepted either
    const { rows } = await t.handle.executor.query<{ token: string }>(`SELECT token FROM auth_session LIMIT 1`);
    expect(await t.auth.getSession(new Headers({ cookie: `tp.session_token=${rows[0]!.token}` }))).toBeNull();
  });
});

describe("platform role cannot be set by users", () => {
  it("ignores or rejects role in the sign-up body", async () => {
    const res = await t.call("/sign-up/email", {
      body: { email: "mallory@example.com", password: PASSWORD, name: "Mallory", role: "owner" },
    });
    expect([200, 400]).toContain(res.status);
    const { rows } = await t.handle.executor.query<{ role: string }>(
      `SELECT role FROM auth_user WHERE email = 'mallory@example.com'`,
    );
    for (const r of rows) expect(r.role).toBe("customer");
  });

  it("ignores or rejects role in update-user", async () => {
    const { jar, user } = await t.verifiedUser("mallory2@example.com", "Mallory");
    const res = await t.call("/update-user", { body: { name: "M", role: "operator" }, jar });
    expect([200, 400]).toContain(res.status);
    const { rows } = await t.handle.executor.query<{ role: string }>(`SELECT role FROM auth_user WHERE id = $1`, [user.id]);
    expect(rows[0]!.role).toBe("customer");
  });
});

describe("password reset", () => {
  it("full flow: old password fails, every other session is revoked, token is single-use", async () => {
    await t.verifiedUser("bob@example.com", "Bob");
    const a = await t.signIn("bob@example.com");
    const b = await t.signIn("bob@example.com");
    expect(await t.auth.getSession(headersFor(a.jar))).not.toBeNull();

    const req = await t.call("/request-password-reset", { body: { email: "bob@example.com", redirectTo: "/reset" } });
    expect(req.status).toBe(200);
    const mail = t.lastEmail("bob@example.com", "auth.reset-password");
    const link = t.linkIn(mail);
    const token = new URL(link).pathname.split("/").pop()!;
    expect(token.length).toBeGreaterThan(10);

    // too-short new password rejected and token still usable afterwards
    expect((await t.call("/reset-password", { body: { token, newPassword: "short" } })).status).toBe(400);

    const reset = await t.call("/reset-password", { body: { token, newPassword: "a brand new password" } });
    expect(reset.status).toBe(200);

    expect(await t.auth.getSession(headersFor(a.jar))).toBeNull();
    expect(await t.auth.getSession(headersFor(b.jar))).toBeNull();
    expect((await t.signIn("bob@example.com", PASSWORD)).res.status).toBe(401);
    expect((await t.signIn("bob@example.com", "a brand new password")).res.status).toBe(200);

    const again = await t.call("/reset-password", { body: { token, newPassword: "yet another password" } });
    expect(again.status).toBe(400);
  });

  it("does not reveal unknown emails and sends nothing", async () => {
    const before = t.emails.length;
    const res = await t.call("/request-password-reset", { body: { email: "ghost@example.com", redirectTo: "/reset" } });
    expect(res.status).toBe(200);
    expect(t.emails.length).toBe(before);
  });

  it("rejects redirectTo on a foreign origin (no open redirect)", async () => {
    const res = await t.call("/request-password-reset", { body: { email: "bob@example.com", redirectTo: "https://evil.example/steal" } });
    expect(res.status).toBe(403);
  });
});

describe("sessions", () => {
  it("lists sessions and revokes another one", async () => {
    await t.verifiedUser("carol@example.com", "Carol");
    const a = await t.signIn("carol@example.com");
    const b = await t.signIn("carol@example.com");
    const list = await t.call("/list-sessions", { jar: a.jar });
    expect(list.status).toBe(200);
    const sessions = (await list.json()) as { token: string; userId: string }[];
    expect(sessions.length).toBeGreaterThanOrEqual(3);

    const bSession = await t.auth.getSession(headersFor(b.jar));
    const revoke = await t.call("/revoke-session", { body: { token: bSession!.session.token }, jar: a.jar });
    expect(revoke.status).toBe(200);
    expect(await t.auth.getSession(headersFor(b.jar))).toBeNull();
    expect(await t.auth.getSession(headersFor(a.jar))).not.toBeNull();

    const others = await t.call("/revoke-other-sessions", { body: {}, jar: a.jar });
    expect(others.status).toBe(200);
    const after = (await (await t.call("/list-sessions", { jar: a.jar })).json()) as unknown[];
    expect(after).toHaveLength(1);
  });

  it("a user cannot revoke someone else's session", async () => {
    const dave = await t.verifiedUser("dave@example.com", "Dave");
    const erin = await t.verifiedUser("erin@example.com", "Erin");
    await t.call("/revoke-session", { body: { token: erin.session.token }, jar: dave.jar });
    expect(await t.auth.getSession(headersFor(erin.jar))).not.toBeNull();
  });

  it("session expiry is 30 days", async () => {
    const { session } = await t.verifiedUser("frank@example.com", "Frank");
    const days = (new Date(session.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30.01);
  });
});
