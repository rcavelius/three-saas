import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp, PASSWORD, STEPS, type App } from "./test/harness";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

describe("auth flows through the app's /api/auth route", () => {
  it("signs up, requires email verification, verifies via the emailed link and logs in", async () => {
    const r = await app.auth("/sign-up/email", { body: { email: "flow@example.com", password: PASSWORD, name: "Flow" } });
    expect(r.status).toBe(200);
    const mail = app.lastEmail("flow@example.com", "auth.verify-email");
    expect(mail.subject).toContain("GridRinse");
    expect(mail.html).toContain("GridRinse");
    // Unverified: login refused.
    const early = await app.auth("/sign-in/email", { body: { email: "flow@example.com", password: PASSWORD } });
    expect(early.status).toBe(403);
    const jar = new Map<string, string>();
    const v = await app.auth(app.linkIn(mail), { jar, origin: null });
    expect(v.status).toBeLessThan(400);
    expect([...jar.keys()].some((k) => k.startsWith("gr."))).toBe(true);
    const login = await app.auth("/sign-in/email", { body: { email: "flow@example.com", password: PASSWORD }, jar: new Map() });
    expect(login.status).toBe(200);
    // A personal workspace exists, owned by the user.
    const ent = await app.entitlements(jar);
    const body = (await ent.json()) as { signedIn: boolean; planId: string; org: { role: string } };
    expect(body).toMatchObject({ signedIn: true, planId: "free", org: { role: "owner" } });
  });

  it("password reset email works and revokes sessions", async () => {
    const u = await app.user("reset@example.com");
    const r = await app.auth("/request-password-reset", { body: { email: "reset@example.com", redirectTo: "/reset-password" } });
    expect(r.status).toBe(200);
    const link = app.linkIn(app.lastEmail("reset@example.com", "auth.reset-password"));
    const follow = await app.auth(link, { origin: null });
    expect(follow.status).toBe(302);
    const token = new URL(follow.headers.get("location")!, "http://x").searchParams.get("token")!;
    const done = await app.auth("/reset-password", { body: { newPassword: "another long password", token } });
    expect(done.status).toBe(200);
    expect(await app.p.auth.getSession(new Headers({ cookie: [...u.jar].map(([k, v]) => `${k}=${v}`).join("; ") }))).toBeNull();
  });

  it("anonymous entitlements are the catalog's free plan; plan limits never come from the client", async () => {
    const r = await app.entitlements(undefined);
    const body = (await r.json()) as { signedIn: boolean; planId: string; limits: Record<string, number> };
    expect(body.signedIn).toBe(false);
    expect(body.limits).toMatchObject({ maxFileMb: 5, maxRows: 50_000, filesPerBatch: 3, savedWorkflows: 0 });
    // A forged query/body cannot change it.
    const forged = await app.call((p, req) => app.routes.entitlementsRoute(p, req), "/api/me/entitlements?planId=business");
    expect(((await forged.json()) as { planId: string }).planId).toBe("free");
  });
});

describe("saved workflows: tenancy, plan limits, validation", () => {
  it("free plan cannot store workflows on the server (savedWorkflows = 0)", async () => {
    const u = await app.user("free-wf@example.com");
    const r = await app.wf.create(u.jar, { name: "Orders", steps: STEPS });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe("plan_required");
  });

  it("cross-tenant: user B gets 404 for user A's workflow on read, update, delete; lists are separate", async () => {
    const a = await app.user("tenant-a@example.com");
    const b = await app.user("tenant-b@example.com");
    await app.subscribe(a.jar, "pro");
    await app.subscribe(b.jar, "pro");
    const created = await app.wf.create(a.jar, { name: "A's workflow", steps: STEPS });
    expect(created.status).toBe(201);
    const { workflow } = (await created.json()) as { workflow: { id: string } };

    expect((await app.wf.get(b.jar, workflow.id)).status).toBe(404);
    expect((await app.wf.update(b.jar, workflow.id, { name: "hijack", steps: [] })).status).toBe(404);
    expect((await app.wf.remove(b.jar, workflow.id)).status).toBe(404);
    const listB = (await (await app.wf.list(b.jar)).json()) as { workflows: unknown[] };
    expect(listB.workflows).toHaveLength(0);
    // A still has it, unchanged.
    const got = (await (await app.wf.get(a.jar, workflow.id)).json()) as { workflow: { name: string; version: number } };
    expect(got.workflow).toMatchObject({ name: "A's workflow", version: 1 });
    // An org_id in the body is rejected (strict schema), never used.
    const sneaky = await app.wf.create(b.jar, { name: "x", steps: [], org_id: a.orgId });
    expect(sneaky.status).toBe(400);
    // Unauthenticated
    expect((await app.wf.list(new Map())).status).toBe(401);
    // Malformed ids are 404, not 500
    expect((await app.wf.get(a.jar, "not-a-uuid")).status).toBe(404);
  });

  it("update uses optimistic versions; names are unique per org", async () => {
    const u = await app.user("versions@example.com");
    await app.subscribe(u.jar, "pro");
    const { workflow } = (await (await app.wf.create(u.jar, { name: "Monthly", steps: STEPS })).json()) as { workflow: { id: string; version: number } };
    const ok = await app.wf.update(u.jar, workflow.id, { name: "Monthly", steps: [{ type: "trim" }], expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { workflow: { version: number } }).workflow.version).toBe(2);
    const stale = await app.wf.update(u.jar, workflow.id, { name: "Monthly", steps: [], expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect((await app.wf.create(u.jar, { name: "monthly", steps: [] })).status).toBe(409);
  });

  it("rejects find/replace values over 1 KB and invalid steps (workflows carry no cell data)", async () => {
    const u = await app.user("bigvalue@example.com");
    await app.subscribe(u.jar, "pro");
    const big = "é".repeat(600); // 600 chars, 1200 bytes
    const r1 = await app.wf.create(u.jar, { name: "big find", steps: [{ type: "findReplace", find: "x", replace: big }] });
    expect(r1.status).toBe(400);
    expect(((await r1.json()) as { message: string }).message).toMatch(/1024 bytes/);
    const r2 = await app.wf.create(u.jar, { name: "bad", steps: [{ type: "explode" }] });
    expect(r2.status).toBe(400);
    const r3 = await app.wf.create(u.jar, { name: "fine", steps: [{ type: "findReplace", find: "a".repeat(300), replace: "b".repeat(1000) }] });
    expect(r3.status).toBe(201);
  });

  it("enforces savedWorkflows under withOrgLock: concurrent creates cannot exceed the plan limit", async () => {
    const u = await app.user("race@example.com");
    await app.subscribe(u.jar, "pro"); // limit 50
    for (let i = 0; i < 46; i++) {
      const r = await app.wf.create(u.jar, { name: `wf ${i}`, steps: [] }, { ip: `10.9.0.${i + 1}` });
      expect(r.status).toBe(201);
    }
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => app.wf.create(u.jar, { name: `race ${i}`, steps: [] }, { ip: `10.8.0.${i + 1}` })));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(4);
    expect(codes.filter((c) => c === 403)).toHaveLength(6);
    expect(await app.p.workflows.count(u.orgId)).toBe(50);
  });

  it("CSRF: mutating workflow requests from another origin (or without Origin/Fetch-Metadata) are refused", async () => {
    const u = await app.user("csrf@example.com");
    await app.subscribe(u.jar, "pro");
    expect((await app.wf.create(u.jar, { name: "x", steps: [] }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await app.wf.create(u.jar, { name: "x", steps: [] }, { origin: null })).status).toBe(403);
    expect((await app.wf.create(u.jar, { name: "x", steps: [] }, { origin: null, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await app.wf.create(u.jar, { name: "x", steps: [] }, { origin: null, headers: { "sec-fetch-site": "same-origin" } })).status).toBe(201);
    const checkout = await app.call((p, r) => app.routes.checkoutRouteHandler(p, r), "/api/billing/checkout", { jar: u.jar, body: { planId: "business" }, origin: "https://evil.example" });
    expect(checkout.status).toBe(403);
    // Better Auth's own origin check on its mutating endpoints
    const signOut = await app.auth("/sign-out", { jar: new Map(u.jar), origin: "https://evil.example", body: {} });
    expect(signOut.status).toBe(403);
  });
});

describe("team seats come from billing entitlements", () => {
  it("free plan (1 seat) cannot invite; business (5 seats) can, up to the limit", async () => {
    const owner = await app.user("team-owner@example.com");
    const invite = (email: string) =>
      app.auth("/organization/invite-member", { jar: owner.jar, body: { email, role: "member", organizationId: owner.orgId } });
    const r1 = await invite("mate1@example.com");
    expect(r1.status).toBeGreaterThanOrEqual(400);
    await app.subscribe(owner.jar, "business");
    const r2 = await invite("mate1@example.com");
    expect(r2.status).toBe(200);
    const mate = await app.user("mate1@example.com");
    const inv = app.linkIn(app.lastEmail("mate1@example.com", "auth.invitation"));
    const invitationId = inv.split("/").pop()!;
    const acc = await app.auth("/organization/accept-invitation", { jar: mate.jar, body: { invitationId } });
    expect(acc.status).toBe(200);
    // The member now sees the team's workflows (shared team workflows on Business).
    const { workflow } = (await (await app.wf.create(owner.jar, { name: "Team flow", steps: STEPS })).json()) as { workflow: { id: string } };
    await app.auth("/organization/set-active", { jar: mate.jar, body: { organizationId: owner.orgId } });
    const got = await app.wf.get(mate.jar, workflow.id);
    expect(got.status).toBe(200);
    // Members can't change or delete workflows saved by others; the owner can.
    expect((await app.wf.remove(mate.jar, workflow.id)).status).toBe(403);
    expect((await app.wf.update(mate.jar, workflow.id, { name: "Hijacked", steps: STEPS })).status).toBe(403);
    expect((await app.wf.update(owner.jar, workflow.id, { name: "Team flow v2", steps: STEPS })).status).toBe(200);
    // A member can edit a workflow they saved themselves.
    const own = (await (await app.wf.create(mate.jar, { name: "Mate flow", steps: STEPS })).json()) as { workflow: { id: string } };
    expect((await app.wf.update(mate.jar, own.workflow.id, { name: "Mate flow v2", steps: STEPS })).status).toBe(200);
    // 2 members + 3 pending invitations fill the 5 seats; the next invitation is refused server-side.
    for (const e of ["mate2@example.com", "mate3@example.com", "mate4@example.com"]) expect((await invite(e)).status).toBe(200);
    const full = await invite("mate5@example.com");
    expect(full.status).toBe(403);
    expect(((await full.json()) as { code: string }).code).toBe("SEAT_LIMIT_REACHED");
  });
});

describe("rate limits use the trusted proxy IP, not spoofable headers", () => {
  it("rotating X-Forwarded-For does not escape the per-IP limit (TRUSTED_PROXY=fly)", async () => {
    const ip = "203.0.113.77";
    let last = 0;
    for (let i = 0; i < 121; i++) {
      const r = await app.call((p, req) => app.routes.entitlementsRoute(p, req), "/api/me/entitlements", { ip, headers: { "x-forwarded-for": `198.51.100.${i % 250}` } });
      last = r.status;
    }
    expect(last).toBe(429);
    const other = await app.call((p, req) => app.routes.entitlementsRoute(p, req), "/api/me/entitlements", { ip: "203.0.113.78" });
    expect(other.status).toBe(200);
  });

  it("Better Auth sign-in limit keys on the same trusted IP (client-sent x-gr-client-ip is overwritten)", async () => {
    const limited = await makeApp({ authRateLimit: true });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await limited.auth("/sign-in/email", {
          ip: "192.0.2.10",
          headers: { "x-forwarded-for": `198.51.100.${i}`, "x-gr-client-ip": `198.51.100.${i}` },
          body: { email: "nobody@example.com", password: "wrong password!!" },
        });
        statuses.push(r.status);
      }
      expect(statuses).toContain(429);
      const fresh = await limited.auth("/sign-in/email", { ip: "192.0.2.11", body: { email: "nobody@example.com", password: "wrong password!!" } });
      expect(fresh.status).not.toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe("account deletion purges the org's server data", () => {
  it("cancels billing, deletes the org's workflows and membership, unlinks analytics", async () => {
    const u = await app.user("leaving@example.com");
    const subId = await app.subscribe(u.jar, "pro");
    await app.wf.create(u.jar, { name: "To be deleted", steps: STEPS });
    await app.p.handle.executor.query(`INSERT INTO analytics_events (name, user_id, props) VALUES ('pageview', $1, '{}')`, [u.userId]);
    expect(await app.p.workflows.count(u.orgId)).toBe(1);

    const wrong = await app.auth("/delete-user", { jar: u.jar, body: { password: "not my password" } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(await app.p.workflows.count(u.orgId)).toBe(1);

    const r = await app.auth("/delete-user", { jar: u.jar, body: { password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(await app.p.workflows.count(u.orgId)).toBe(0);
    expect(app.fake.subscriptionsById.get(subId)!.status).toBe("canceled");
    const ex = app.p.handle.executor;
    expect((await ex.query(`SELECT 1 FROM auth_user WHERE id = $1`, [u.userId])).rows).toHaveLength(0);
    expect((await ex.query(`SELECT 1 FROM auth_organization WHERE id = $1`, [u.orgId])).rows).toHaveLength(0);
    expect((await ex.query(`SELECT 1 FROM analytics_events WHERE user_id = $1`, [u.userId])).rows).toHaveLength(0);
    // Old cookie no longer works.
    expect((await app.wf.list(u.jar)).status).toBe(401);
  });
});
