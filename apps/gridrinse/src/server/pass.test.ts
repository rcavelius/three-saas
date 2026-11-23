/**
 * One-time pass end to end on the real platform (PGlite + FakeStripe with signed webhooks): an anonymous visitor
 * buys the 24-hour pass, Stripe completes it, the claim route sets the signed pass cookie, and the entitlements
 * the browser applies show the raised limits until the pass ends or is refunded.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GRIDRINSE_CATALOG, getFreePlan } from "@repo/billing";
import { PASS_COOKIE } from "./platform";
import { makeApp, type App, type Jar } from "./test/harness";

let t = new Date("2026-11-23T10:00:00Z").getTime();
const now = () => new Date(t);
const HOUR = 3_600_000;

let app: App;
beforeAll(async () => {
  app = await makeApp({ now });
});
afterAll(async () => {
  await app.close();
});

interface Ent {
  signedIn: boolean;
  planId: string;
  limits: Record<string, number>;
  pass: { name: string; expiresAt: string; unlockUrl: string } | null;
}
const ent = async (jar?: Jar) => (await (await app.entitlements(jar)).json()) as Ent;
const free = getFreePlan(GRIDRINSE_CATALOG);

const startCheckout = (jar: Jar | undefined, body: unknown, origin?: string | null) =>
  app.call((p, r) => app.routes.passCheckoutRouteHandler(p, r), "/api/billing/pass/checkout", { jar, body, origin });
const claim = (jar: Jar, sessionId: string, next = "/") =>
  app.call((p, r) => app.routes.passClaimRouteHandler(p, r), `/api/billing/pass/claim?session_id=${encodeURIComponent(sessionId)}&next=${encodeURIComponent(next)}`, { jar, origin: null });

/** Anonymous purchase through the app's routes; returns the session id and payment intent. */
async function buyPass(jar: Jar, returnPath = "/tools/remove-duplicates-csv") {
  const r = await startCheckout(jar, { passId: "day", returnPath });
  expect(r.status).toBe(200);
  const { url } = (await r.json()) as { url: string };
  const sessionId = url.split("/").pop()!;
  const pi = app.fake.completePassCheckout(sessionId);
  expect(await app.deliverWebhooks()).toEqual([200]);
  return { sessionId, pi };
}

describe("24-hour pass (anonymous, no account)", () => {
  it("anonymous visitors start on the free tier with the download fence and no pass", async () => {
    const e = await ent(new Map());
    expect(e.signedIn).toBe(false);
    expect(e.limits).toMatchObject({ maxFileMb: 5, maxRows: 50_000, filesPerBatch: 3, downloadRows: 1_000, downloadsPerDay: 1 });
    expect(e.limits).toEqual(free.limits);
    expect(e.pass).toBeNull();
  });

  it("buy -> webhook -> claim sets the cookie -> entitlements show the raised limits and the unlock link", async () => {
    const jar: Jar = new Map();
    const { sessionId } = await buyPass(jar);
    const c = await claim(jar, sessionId, "/tools/remove-duplicates-csv");
    expect(c.status).toBe(303);
    expect(c.headers.get("location")).toBe("/tools/remove-duplicates-csv?pass=active");
    expect(jar.get(PASS_COOKIE)).toBeTruthy();
    expect(c.headers.getSetCookie().join(";")).toMatch(/HttpOnly/);

    const e = await ent(jar);
    expect(e.planId).toBe("free");
    expect(e.limits).toMatchObject({ maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20, downloadRows: -1, downloadsPerDay: -1 });
    expect(e.pass?.name).toBe("24-hour pass");
    expect(new Date(e.pass!.expiresAt).getTime()).toBe(t + 24 * HOUR);
    expect(e.pass!.unlockUrl).toBe(`http://localhost:3102/api/billing/pass/claim?session_id=${sessionId}&next=%2F`);

    // The unlock link works in another browser (a fresh cookie jar).
    const other: Jar = new Map();
    const u = new URL(e.pass!.unlockUrl);
    const again = await app.call((p, r) => app.routes.passClaimRouteHandler(p, r), u.pathname + u.search, { jar: other, origin: null });
    expect(again.headers.get("location")).toBe("/?pass=active");
    expect((await ent(other)).limits.downloadRows).toBe(-1);

    // Another visitor without the cookie stays free.
    expect((await ent(new Map())).limits.downloadRows).toBe(1_000);
  });

  it("an expired pass falls back to the free limits", async () => {
    const jar: Jar = new Map();
    const { sessionId } = await buyPass(jar);
    await claim(jar, sessionId);
    expect((await ent(jar)).limits.downloadsPerDay).toBe(-1);
    const saved = t;
    t += 24 * HOUR + 1000;
    try {
      const e = await ent(jar);
      expect(e.limits).toEqual(free.limits);
      expect(e.pass).toBeNull();
      const late = await claim(new Map(), sessionId);
      expect(late.headers.get("location")).toBe("/?pass=expired");
    } finally {
      t = saved;
    }
  });

  it("a refunded pass stops working", async () => {
    const jar: Jar = new Map();
    const { sessionId, pi } = await buyPass(jar);
    await claim(jar, sessionId);
    expect((await ent(jar)).limits.maxFileMb).toBe(50);
    app.fake.refundPayment(pi);
    await app.deliverWebhooks();
    const e = await ent(jar);
    expect(e.limits).toEqual(free.limits);
    expect(e.pass).toBeNull();
    expect((await claim(new Map(), sessionId)).headers.get("location")).toBe("/?pass=revoked");
  });

  it("a forged or tampered pass cookie is ignored", async () => {
    const jar: Jar = new Map();
    const { sessionId } = await buyPass(jar);
    // The paid session id without a valid signature unlocks nothing.
    expect((await ent(new Map([[PASS_COOKIE, `${sessionId}.forged-signature`]]))).limits).toEqual(free.limits);
    expect((await ent(new Map([[PASS_COOKIE, sessionId]]))).limits).toEqual(free.limits);
    await claim(jar, sessionId);
    const good = jar.get(PASS_COOKIE)!;
    const otherId = `cs_test_${"x".repeat(24)}`;
    expect((await ent(new Map([[PASS_COOKIE, good.replace(sessionId, otherId)]]))).limits).toEqual(free.limits);
  });

  it("an unpaid (async) checkout does not unlock until the payment clears", async () => {
    const jar: Jar = new Map();
    const r = await startCheckout(jar, { passId: "day", returnPath: "/" });
    const sessionId = ((await r.json()) as { url: string }).url.split("/").pop()!;
    app.fake.completePassCheckout(sessionId, { paymentStatus: "unpaid" });
    await app.deliverWebhooks();
    const c = await claim(jar, sessionId);
    expect(c.headers.get("location")).toBe("/?pass=unpaid");
    expect(jar.has(PASS_COOKIE)).toBe(false);
    app.fake.succeedAsyncPayment(sessionId);
    await app.deliverWebhooks();
    expect((await claim(jar, sessionId)).headers.get("location")).toBe("/?pass=active");
    expect((await ent(jar)).limits.downloadRows).toBe(-1);
  });

  it("checkout is same-origin only, rejects unknown passes and never redirects off-site", async () => {
    expect((await startCheckout(undefined, { passId: "day" }, "https://evil.example")).status).toBe(403);
    expect((await startCheckout(undefined, { passId: "lifetime" })).status).toBe(400);
    const r = await startCheckout(undefined, { passId: "day", returnPath: "https://evil.example/x" });
    expect(r.status).toBe(200);
    const sessionId = ((await r.json()) as { url: string }).url.split("/").pop()!;
    app.fake.completePassCheckout(sessionId);
    await app.deliverWebhooks();
    const c = await claim(new Map(), sessionId, "https://evil.example/x");
    expect(c.headers.get("location")!.startsWith("/")).toBe(true);
    expect(c.headers.get("location")).not.toContain("evil");
    expect((await claim(new Map(), "cs_test_not_a_real_session_00000")).headers.get("location")).toBe("/?pass=invalid");
  });

  it("a pass bought while signed in counts for the workspace, in any browser", async () => {
    const u = await app.user("passbuyer@example.com");
    const { sessionId } = await buyPass(u.jar, "/");
    // Even before the claim redirect sets the cookie, the webhook bound the pass to the org.
    const signedInNoCookie = new Map([...u.jar].filter(([k]) => k !== PASS_COOKIE));
    const e = await ent(signedInNoCookie);
    expect(e.signedIn).toBe(true);
    expect(e.limits).toMatchObject({ maxFileMb: 50, downloadRows: -1, savedWorkflows: 0 });
    expect(e.pass?.unlockUrl).toContain(sessionId);
    // Saved workflows stay a plan feature (the pass does not add account storage).
    expect((await app.wf.create(u.jar, { name: "x", steps: [] })).status).toBe(403);
  });

  it("without Stripe configured the pass checkout answers a clear 503", async () => {
    const none = await makeApp({ stripe: "none" });
    try {
      const r = await none.call((p, req) => none.routes.passCheckoutRouteHandler(p, req), "/api/billing/pass/checkout", { body: { passId: "day" } });
      expect(r.status).toBe(503);
      expect(((await r.json()) as { error: string }).error).toBe("billing_not_configured");
    } finally {
      await none.close();
    }
  });
});
