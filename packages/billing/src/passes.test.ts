import { describe, expect, it } from "vitest";
import { applyPassGrants, defineCatalog, maxLimit, type Catalog } from "./catalog";
import { ALL_CATALOGS, CHANGEKITE_CATALOG, GRIDRINSE_CATALOG, WEBHOOKTRAIL_CATALOG } from "./catalogs";
import { safeReturnPath, type ActivePass } from "./billing";
import { passCheckoutRoute, passClaimRoute } from "./routes";
import { readCookie, signPassToken, verifyPassToken } from "./pass-token";
import { APP_URL, DAY, setup } from "./test-helpers";

const SECRET = "pass-cookie-secret-for-tests-0123456789abcdef";
const HOUR = 3_600_000;

async function passSetup(catalog: Catalog = GRIDRINSE_CATALOG) {
  const passes: ActivePass[] = [];
  return { ...(await setup({ catalog, passCookie: { name: "t_pass", secret: SECRET }, hooks: { onPassPurchased: async (p) => void passes.push(p) } })), passes };
}

/** Buys a pass end to end (checkout -> customer pays -> webhooks delivered). */
async function buy(t: Awaited<ReturnType<typeof passSetup>>, passId: string, o: { orgId?: string } = {}) {
  const s = await t.billing.createPassCheckout(passId, { orgId: o.orgId ?? null, returnPath: "/tools/x?y=1" });
  const pi = t.fake.completePassCheckout(s.id);
  const res = await t.fake.deliverAll(t.billing);
  for (const r of res) if (r.status !== 200) throw new Error(`webhook ${r.type} -> ${r.status} ${r.body}`);
  return { sessionId: s.id, pi };
}

describe("pass catalog", () => {
  it("every shipped pass is valid, priced and only raises existing limits", () => {
    for (const c of ALL_CATALOGS) {
      expect(c.passes?.length).toBeGreaterThan(0);
      for (const p of c.passes!) {
        expect(p.priceCents).toBeGreaterThan(0);
        expect(p.stripeLookupKey).toMatch(new RegExp(`^${c.app}_[a-z]+_pass$`));
      }
    }
    expect(GRIDRINSE_CATALOG.passes![0]).toMatchObject({ id: "day", priceCents: 500, durationHours: 24 });
    expect(CHANGEKITE_CATALOG.passes![0]).toMatchObject({ id: "report", priceCents: 900, durationHours: 168 });
    expect(WEBHOOKTRAIL_CATALOG.passes![0]).toMatchObject({ id: "week", priceCents: 500, durationHours: 168 });
  });

  it("free tiers are a taste: limited downloads / issues, paid plans unlimited", () => {
    const gr = GRIDRINSE_CATALOG.plans;
    expect(gr.find((p) => p.id === "free")!.limits).toMatchObject({ downloadRows: 1000, downloadsPerDay: 1 });
    for (const p of gr.filter((p) => p.id !== "free")) expect(p.limits).toMatchObject({ downloadRows: -1, downloadsPerDay: -1 });
    const ck = CHANGEKITE_CATALOG.plans;
    expect(ck.find((p) => p.id === "free")!).toMatchObject({ limits: { reportIssues: 3 }, features: { fullReport: false } });
    for (const p of ck.filter((p) => p.id !== "free")) expect(p).toMatchObject({ limits: { reportIssues: -1 }, features: { fullReport: true } });
  });

  it("rejects passes with unknown keys or clashing lookup keys", () => {
    const base = structuredClone(GRIDRINSE_CATALOG);
    expect(() => defineCatalog({ ...base, passes: [{ ...base.passes![0]!, limits: { nope: 1 } }] })).toThrow(/not a plan limit/);
    expect(() =>
      defineCatalog({ ...base, passes: [{ ...base.passes![0]!, stripeLookupKey: "gridrinse_pro_monthly" }] }),
    ).toThrow(/duplicate lookup key/);
    expect(() => defineCatalog({ ...base, passes: [base.passes![0]!, base.passes![0]!] })).toThrow(/duplicate pass id/);
  });

  it("grants: larger limit wins, -1 beats all, features are ORed", () => {
    expect(maxLimit(5, 50)).toBe(50);
    expect(maxLimit(-1, 50)).toBe(-1);
    expect(maxLimit(500, -1)).toBe(-1);
    const r = applyPassGrants({ a: 5, b: -1, c: 10 }, { x: false, y: true }, [{ limits: { a: 50, b: 3, c: -1 }, features: { x: true, y: false } }]);
    expect(r).toEqual({ limits: { a: 50, b: -1, c: -1 }, features: { x: true, y: true } });
  });
});

describe("pass token and helpers", () => {
  it("signs and verifies; tampering and other secrets fail", () => {
    const tok = signPassToken("cs_test_abc123", SECRET);
    expect(verifyPassToken(tok, SECRET)).toBe("cs_test_abc123");
    expect(verifyPassToken(tok.replace("abc123", "abc124"), SECRET)).toBeNull();
    expect(verifyPassToken(tok, SECRET + "x")).toBeNull();
    expect(verifyPassToken("cs_test_abc123", SECRET)).toBeNull();
    expect(verifyPassToken("", SECRET)).toBeNull();
  });

  it("reads cookies and keeps return paths on this site", () => {
    expect(readCookie("a=1; t_pass=xyz; b=2", "t_pass")).toBe("xyz");
    expect(readCookie("a=1", "t_pass")).toBeNull();
    expect(safeReturnPath("/report/abc?x=1")).toBe("/report/abc?x=1");
    for (const bad of ["https://evil.test/", "//evil.test", "/\\evil", "javascript:alert(1)", "", null, "/a\nb"]) {
      expect(safeReturnPath(bad)).toBe("/");
    }
  });
});

describe("one-time passes", () => {
  it("anonymous checkout: payment mode, no customer, metadata, claim URL and statement suffix", async () => {
    const t = await passSetup();
    const s = await t.billing.createPassCheckout("day", { returnPath: "/tools/dedupe" });
    const params = t.fake.sessionsById.get(s.id)!;
    expect(params).toMatchObject({
      mode: "payment",
      customer_creation: "always",
      line_items: [{ price: t.fake.priceIdForLookupKey("gridrinse_day_pass"), quantity: 1 }],
      metadata: { app: "gridrinse", kind: "pass", passId: "day" },
      payment_intent_data: { metadata: { app: "gridrinse", kind: "pass", passId: "day" } },
      cancel_url: `${APP_URL}/tools/dedupe?pass=canceled`,
      allow_promotion_codes: false,
    });
    expect(params.customer).toBeUndefined();
    expect(params.client_reference_id).toBeUndefined();
    expect(params.success_url).toBe(`${APP_URL}/api/billing/pass/claim?session_id={CHECKOUT_SESSION_ID}&next=%2Ftools%2Fdedupe`);
    await expect(t.billing.createPassCheckout("nope")).rejects.toMatchObject({ code: "invalid_plan", status: 400 });
    // Nothing is granted for an unpaid session.
    expect((await t.billing.getEntitlements(null, { passIds: [s.id] })).limits.downloadRows).toBe(1000);
  });

  it("webhook records the pass once; entitlements rise for 24 hours, then fall back", async () => {
    const t = await passSetup();
    const free = await t.billing.getEntitlements(null);
    expect(free).toMatchObject({ planId: "free", pass: null, limits: { maxFileMb: 5, downloadRows: 1000, downloadsPerDay: 1 } });

    const { sessionId } = await buy(t, "day");
    expect(t.passes).toHaveLength(1);
    const ent = await t.billing.getEntitlements(null, { passIds: [sessionId] });
    expect(ent.planId).toBe("free");
    expect(ent.limits).toMatchObject({ maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20, downloadRows: -1, downloadsPerDay: -1 });
    // Account-only limits are not part of the pass.
    expect(ent.limits.savedWorkflows).toBe(0);
    expect(ent.pass).toEqual({ id: sessionId, passId: "day", name: "24-hour pass", expiresAt: new Date(t.clock.t.getTime() + 24 * HOUR) });
    // Someone else's visit without the id gets nothing.
    expect((await t.billing.getEntitlements(null)).pass).toBeNull();

    // Duplicate delivery and the buyer's claim do not create a second pass or move its expiry.
    t.advance(HOUR);
    const claim = await t.billing.claimPass(sessionId);
    expect(claim).toMatchObject({ status: "active", pass: { expiresAt: ent.pass!.expiresAt } });
    expect(t.passes).toHaveLength(1);
    const rows = await t.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM billing_passes`);
    expect(rows.rows[0]!.n).toBe(1);

    t.advance(23 * HOUR);
    const after = await t.billing.getEntitlements(null, { passIds: [sessionId] });
    expect(after).toMatchObject({ pass: null, limits: { downloadRows: 1000, maxFileMb: 5 } });
    expect(await t.billing.claimPass(sessionId)).toMatchObject({ status: "expired" });
  });

  it("claim before the webhook: verifies with Stripe and records; the late webhook is a no-op", async () => {
    const t = await passSetup();
    const s = await t.billing.createPassCheckout("day");
    expect(await t.billing.claimPass(s.id)).toEqual({ status: "unpaid" });
    t.fake.completePassCheckout(s.id);
    const claim = await t.billing.claimPass(s.id);
    expect(claim.status).toBe("active");
    expect(t.passes).toHaveLength(1);
    const res = await t.fake.deliverAll(t.billing);
    expect(res.map((r) => [r.type, r.status, JSON.parse(r.body).outcome])).toEqual([["checkout.session.completed", 200, "processed"]]);
    expect(t.passes).toHaveLength(1);
  });

  it("delayed (async) payments unlock only when paid", async () => {
    const t = await passSetup();
    const s = await t.billing.createPassCheckout("day");
    t.fake.completePassCheckout(s.id, { paymentStatus: "unpaid" });
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements(null, { passIds: [s.id] })).pass).toBeNull();
    expect((await t.events())[0]).toMatchObject({ outcome: "ignored" });
    t.fake.succeedAsyncPayment(s.id);
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements(null, { passIds: [s.id] })).pass?.passId).toBe("day");
  });

  it("a full refund revokes the pass; partial refunds and other businesses' refunds do not", async () => {
    const t = await passSetup();
    const { sessionId, pi } = await buy(t, "day");
    t.fake.refundPayment(pi, { full: false });
    t.fake.refundPayment("pi_other_business");
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements(null, { passIds: [sessionId] })).pass).not.toBeNull();
    t.fake.refundPayment(pi);
    const res = await t.fake.deliverAll(t.billing);
    expect(JSON.parse(res[0]!.body).outcome).toBe("processed");
    expect((await t.billing.getEntitlements(null, { passIds: [sessionId] })).pass).toBeNull();
    expect(await t.billing.claimPass(sessionId)).toMatchObject({ status: "revoked" });
  });

  it("a pass bought while signed in counts for the org without a cookie, on top of its plan", async () => {
    const t = await passSetup(CHANGEKITE_CATALOG);
    await buy(t, "report", { orgId: "org_a" });
    const ent = await t.billing.getEntitlements("org_a");
    expect(ent).toMatchObject({ planId: "free", limits: { pagesPerScan: 250, reportIssues: -1, sites: 0 }, features: { fullReport: true, pdfReports: true, scheduledScans: false } });
    expect(t.fake.sessionsById.get([...t.fake.sessionsById.keys()][0]!)!.client_reference_id).toBe("org_a");
    expect((await t.billing.getEntitlements("org_b")).features.fullReport).toBe(false);

    // A subscriber with a pass keeps the better of both.
    await t.subscribe("org_a", "agency");
    const both = await t.billing.getEntitlements("org_a");
    expect(both).toMatchObject({ planId: "agency", limits: { pagesPerScan: 1000, sites: 20 }, features: { pdfReports: true } });
    t.advance(8 * DAY);
    expect((await t.billing.getEntitlements("org_a")).pass).toBeNull();
  });

  it("ignores payment checkouts of other products and forged or malformed ids", async () => {
    const t = await passSetup();
    t.fake.emitRaw("checkout.session.completed", { id: "cs_test_other", object: "checkout.session", mode: "payment", metadata: { app: "snackbox" } });
    const res = await t.fake.deliverAll(t.billing);
    expect(JSON.parse(res[0]!.body).outcome).toBe("ignored");
    expect(await t.billing.claimPass("cs_test_doesnotexist")).toEqual({ status: "invalid" });
    expect(await t.billing.claimPass("not-a-session")).toEqual({ status: "invalid" });
    expect(await t.billing.claimPass("cs_live_x'; DROP TABLE billing_passes;--")).toEqual({ status: "invalid" });
    expect((await t.billing.getEntitlements(null, { passIds: ["cs_test_doesnotexist", "garbage"] })).pass).toBeNull();
    // A ChangeKite pass id cannot be used on GridRinse.
    const ck = await passSetup(CHANGEKITE_CATALOG);
    const { sessionId } = await buy(ck, "report");
    expect(await t.billing.claimPass(sessionId)).toEqual({ status: "invalid" });
  });

  it("cookie: Set-Cookie until expiry, verified ids only", async () => {
    const t = await passSetup();
    const { sessionId } = await buy(t, "day");
    const claim = await t.billing.claimPass(sessionId);
    if (claim.status !== "active") throw new Error("expected active");
    const cookie = t.billing.passSetCookie(claim.pass)!;
    expect(cookie).toMatch(/^t_pass=cs_test_[A-Za-z0-9]+\.[A-Za-z0-9_-]+; Path=\/; Max-Age=86400; HttpOnly; SameSite=Lax; Secure$/);
    const value = cookie.split(";")[0]!;
    expect(t.billing.passIdsFromCookieHeader(`x=1; ${value}`)).toEqual([sessionId]);
    expect(t.billing.passIdsFromCookieHeader(`t_pass=${sessionId}.forged`)).toEqual([]);
    expect(t.billing.passIdsFromCookieHeader(null)).toEqual([]);
  });
});

describe("pass routes", () => {
  const post = (body: unknown, origin = APP_URL) =>
    new Request(`${APP_URL}/api/billing/pass/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    });

  it("checkout route: anonymous ok, cross-origin refused, bad pass 400, org attached when signed in", async () => {
    const t = await passSetup();
    const anon = passCheckoutRoute(t.billing);
    const r = await anon(post({ passId: "day", returnPath: "/x" }));
    expect(r.status).toBe(200);
    expect((await r.json()).url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect((await anon(post({ passId: "day" }, "https://evil.test"))).status).toBe(403);
    expect((await anon(post({ passId: "nope" }))).status).toBe(400);
    expect((await anon(post({}))).status).toBe(400);

    const signedIn = passCheckoutRoute(t.billing, async () => ({ orgId: "org_a", email: "a@example.test" }));
    await signedIn(post({ passId: "day" }));
    const last = [...t.fake.sessionsById.values()].at(-1)!;
    expect(last).toMatchObject({ metadata: { orgId: "org_a" }, customer_email: "a@example.test", client_reference_id: "org_a" });
    // A failing resolver (e.g. no session) still lets the visitor buy anonymously.
    const failing = passCheckoutRoute(t.billing, async () => {
      throw Object.assign(new Error("no session"), { status: 401 });
    });
    expect((await failing(post({ passId: "day" }))).status).toBe(200);
  });

  it("claim route sets the cookie and redirects back with the status", async () => {
    const t = await passSetup();
    const claim = passClaimRoute(t.billing);
    const s = await t.billing.createPassCheckout("day", { returnPath: "/tools/x?y=1" });
    const get = (id: string, next = "/tools/x?y=1") =>
      claim(new Request(`${APP_URL}/api/billing/pass/claim?session_id=${id}&next=${encodeURIComponent(next)}`));

    let r = await get(s.id);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/tools/x?y=1&pass=unpaid");
    // Pending: the signed reference is kept, but grants nothing until the paid session is recorded.
    const pending = r.headers.get("set-cookie")!;
    expect(pending).toMatch(/^t_pass=cs_test_.*Max-Age=1296000;/); // 14 days + the longest pass (24 h)
    const cookieHeader = pending.split(";")[0]!;
    const ids = t.billing.passIdsFromCookieHeader(cookieHeader);
    expect(ids).toEqual([s.id]);
    expect((await t.billing.getEntitlements(null, { passIds: ids })).pass).toBeNull();
    // A delayed payment clears later: the same browser unlocks without coming back through the claim link.
    t.fake.completePassCheckout(s.id, { paymentStatus: "unpaid" });
    t.fake.succeedAsyncPayment(s.id);
    await t.fake.deliverAll(t.billing);
    expect((await t.billing.getEntitlements(null, { passIds: ids })).pass?.passId).toBe("day");
    const s2 = await t.billing.createPassCheckout("day", { returnPath: "/tools/x?y=1" });
    t.fake.completePassCheckout(s2.id);
    r = await get(s2.id);
    expect(r.headers.get("location")).toBe("/tools/x?y=1&pass=active");
    expect(r.headers.get("set-cookie")).toMatch(/^t_pass=.*Max-Age=86400;/);
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");

    r = await get(s2.id, "https://evil.test/");
    expect(r.headers.get("location")).toBe("/?pass=active");
    r = await get("cs_test_nope");
    expect(r.headers.get("location")).toBe("/tools/x?y=1&pass=invalid");
  });
});
