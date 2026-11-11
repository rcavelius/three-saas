/**
 * Auth flows through the app's /api/auth route, billing lifecycle through the app's checkout/webhook
 * routes with FakeStripe (real Stripe signatures), plan enforcement and downgrade, account deletion,
 * spoofed-header rate limits, CSRF on mutating routes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, healthySite, PASSWORD, type Harness, type Jar } from "./harness";
import { GET as sitesGET, POST as sitesPOST } from "@/app/api/sites/route";
import { checkoutHandler, portalHandler } from "@/lib/billing-routes";
import { addSite, enforceSiteLimits, SiteError } from "@/lib/monitoring/sites";
import { createPlatform, installPlatform } from "@/lib/platform";
import { parseSiteproofEnv } from "@/lib/env";
import { coreSchema, createDb } from "@repo/database";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

async function sitesCount(orgId: string) {
  const { rows } = await h.p.handle.executor.query<{ n: number; locked: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE plan_locked)::int AS locked FROM sites WHERE org_id = $1`,
    [orgId],
  );
  return rows[0]!;
}

describe("accounts through the app routes", () => {
  it("sign-up sends a branded verification email; login before verification is refused", async () => {
    const r = await h.auth("/sign-up/email", { body: { email: "early@example.com", password: PASSWORD, name: "Early" } });
    expect(r.status).toBe(200);
    const mail = (await h.outbox("early@example.com", "auth.verify-email"))[0]!;
    expect(mail.subject).toContain("SiteProof");
    expect(mail.text_body).toContain("http://localhost:3101/api/auth/verify-email");
    const login = await h.auth("/sign-in/email", { body: { email: "early@example.com", password: PASSWORD } });
    expect(login.status).toBe(403);
  });

  it("verification signs in and creates a personal org on the free plan", async () => {
    const u = await h.signUpVerified("alice@example.com", "Alice");
    const ents = await h.p.billing.getEntitlements(u.orgId);
    expect(ents.planId).toBe("free");
    const list = await h.call(sitesGET, "GET", "/api/sites", { jar: u.jar });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ sites: [], limit: 0, planId: "free" });
  });

  it("wrong password is rejected and sign-in is rate limited per trusted client IP, even with spoofed X-Forwarded-For", async () => {
    await h.signUpVerified("rl@example.com");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      // the client controls everything left of the proxy-added entry; xff:1 only trusts the right-most one
      const r = await h.auth("/sign-in/email", {
        body: { email: "rl@example.com", password: "wrong-password-123" },
        headers: {},
        ip: `10.0.0.${i}, 203.0.113.77`,
      });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toContain(429);
  });

  it("free plan cannot monitor sites", async () => {
    const u = await h.signUpVerified("free@example.com");
    const r = await h.call(sitesPOST, "POST", "/api/sites", { jar: u.jar, body: { url: "free-site.example.com" } });
    expect(r.status).toBe(402);
    expect((await r.json()).error).toBe("plan_required");
  });

  it("anonymous requests get 401; cross-origin mutations get 403", async () => {
    expect((await h.call(sitesGET, "GET", "/api/sites")).status).toBe(401);
    const u = await h.signUpVerified("csrf@example.com");
    const evil = await h.call(sitesPOST, "POST", "/api/sites", { jar: u.jar, body: { url: "x.example.com" }, origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const evilCheckout = await h.call(checkoutHandler, "POST", "/api/billing/checkout", { jar: u.jar, body: { planId: "solo" }, origin: "https://evil.example" });
    expect(evilCheckout.status).toBe(403);
  });
});

describe("billing lifecycle (FakeStripe + signed webhooks through the app route)", () => {
  let owner: { jar: Jar; userId: string; orgId: string };
  let subId: string;

  beforeAll(async () => {
    owner = await h.signUpVerified("owner@example.com", "Owner");
  });

  it("checkout -> webhook -> Solo entitlements -> 3 sites, the 4th is refused", async () => {
    subId = await h.subscribe(owner.jar, "solo");
    const ents = await h.p.billing.getEntitlements(owner.orgId);
    expect(ents.planId).toBe("solo");
    expect(ents.limits.sites).toBe(3);
    for (const host of ["a1", "a2", "a3"]) {
      h.web.set(`${host}.example.com`, healthySite());
      const r = await h.call(sitesPOST, "POST", "/api/sites", { jar: owner.jar, body: { url: `${host}.example.com` } });
      expect(r.status).toBe(201);
    }
    const fourth = await h.call(sitesPOST, "POST", "/api/sites", { jar: owner.jar, body: { url: "a4.example.com" } });
    expect(fourth.status).toBe(409);
    expect((await fourth.json()).error).toBe("limit_reached");
    const dup = await h.call(sitesPOST, "POST", "/api/sites", { jar: owner.jar, body: { url: "a1.example.com" } });
    expect(dup.status).toBe(409);
  });

  it("a second checkout while subscribed is refused; the portal opens", async () => {
    const again = await h.call(checkoutHandler, "POST", "/api/billing/checkout", { jar: owner.jar, body: { planId: "agency" } });
    expect(again.status).toBe(409);
    const portal = await h.call(portalHandler, "POST", "/api/billing/portal", { jar: owner.jar });
    expect(portal.status).toBe(200);
    expect((await portal.json()).url).toContain("billing.stripe.test");
  });

  it("upgrade in the portal -> Agency (20 sites) and a plan-changed email to the owner", async () => {
    h.stripe.portalChangePrice(subId, "siteproof_agency_monthly");
    expect((await h.deliverWebhooks()).every((s) => s === 200)).toBe(true);
    expect((await h.p.billing.getEntitlements(owner.orgId)).planId).toBe("agency");
    for (const host of ["a4", "a5"]) {
      const r = await h.call(sitesPOST, "POST", "/api/sites", { jar: owner.jar, body: { url: `${host}.example.com` } });
      expect(r.status).toBe(201);
    }
    expect((await h.outbox("owner@example.com", "plan_changed")).length).toBeGreaterThan(0);
  });

  it("downgrade locks the newest excess sites (not deleted) and an upgrade unlocks them", async () => {
    h.stripe.portalChangePrice(subId, "siteproof_solo_monthly");
    await h.deliverWebhooks();
    expect(await sitesCount(owner.orgId)).toEqual({ n: 5, locked: 2 });
    const { rows } = await h.p.handle.executor.query<{ url: string }>(
      `SELECT url FROM sites WHERE org_id = $1 AND plan_locked ORDER BY url`,
      [owner.orgId],
    );
    expect(rows.map((r) => r.url)).toEqual(["https://a4.example.com/", "https://a5.example.com/"]);
    h.stripe.portalChangePrice(subId, "siteproof_agency_monthly");
    await h.deliverWebhooks();
    expect(await sitesCount(owner.orgId)).toEqual({ n: 5, locked: 0 });
  });

  it("payment failure emails the owner and keeps the plan during the grace period", async () => {
    h.stripe.failPayment(subId);
    await h.deliverWebhooks();
    expect((await h.outbox("owner@example.com", "payment_failed")).length).toBe(1);
    expect((await h.p.billing.getEntitlements(owner.orgId)).planId).toBe("agency");
    h.stripe.recoverPayment(subId);
    await h.deliverWebhooks();
  });

  it("webhooks with a bad signature are rejected", async () => {
    const { webhookHandler } = await import("@/lib/billing-routes");
    const res = await webhookHandler(
      new Request("http://localhost:3101/api/billing/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: "{}" }),
    );
    expect(res.status).toBe(400);
  });

  it("cancellation at period end -> free -> every site locked, data kept", async () => {
    h.stripe.portalCancelAtPeriodEnd(subId);
    await h.deliverWebhooks();
    h.stripe.advancePeriod(subId);
    await h.deliverWebhooks();
    expect((await h.p.billing.getEntitlements(owner.orgId)).planId).toBe("free");
    expect(await sitesCount(owner.orgId)).toEqual({ n: 5, locked: 5 });
    expect((await h.outbox("owner@example.com", "subscription_canceled")).length).toBe(1);
  });

  it("only the owner can start checkout (members get 403)", async () => {
    const member = await h.signUpVerified("member-co@example.com");
    // member of owner's org via direct membership row (invitation flow is covered in the auth package)
    await h.p.handle.executor.query(
      `INSERT INTO auth_member (id, organization_id, user_id, role, created_at) VALUES (gen_random_uuid()::text, $1, $2, 'member', now())`,
      [owner.orgId, member.userId],
    );
    await h.auth("/organization/set-active", { jar: member.jar, body: { organizationId: owner.orgId } });
    const r = await h.call(checkoutHandler, "POST", "/api/billing/checkout", { jar: member.jar, body: { planId: "solo" } });
    expect(r.status).toBe(403);
  });
});

describe("team seats follow the plan (teamSeats)", () => {
  it("a 1-seat plan cannot add a second member; Agency (5 seats) can", async () => {
    const owner = await h.signUpVerified("seats-owner@example.com");
    const invitee = await h.signUpVerified("seats-invitee@example.com");
    const inv = await h.auth("/organization/invite-member", { jar: owner.jar, body: { email: "seats-invitee@example.com", role: "member", organizationId: owner.orgId } });
    let accepted = 0;
    if (inv.status === 200) {
      const { id } = (await inv.json()) as { id: string };
      const acc = await h.auth("/organization/accept-invitation", { jar: invitee.jar, body: { invitationId: id } });
      if (acc.status === 200) accepted++;
    }
    expect(accepted).toBe(0);
    const { rows } = await h.p.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth_member WHERE organization_id = $1`, [owner.orgId]);
    expect(rows[0]!.n).toBe(1);

    await h.subscribe(owner.jar, "agency");
    const inv2 = await h.auth("/organization/invite-member", { jar: owner.jar, body: { email: "seats-invitee@example.com", role: "member", organizationId: owner.orgId } });
    expect(inv2.status).toBe(200);
    const { id } = (await inv2.json()) as { id: string };
    expect((await h.auth("/organization/accept-invitation", { jar: invitee.jar, body: { invitationId: id } })).status).toBe(200);
  });
});

describe("quota race", () => {
  it("concurrent adds never exceed the plan's site limit", async () => {
    const u = await h.signUpVerified("race@example.com");
    await h.subscribe(u.jar, "solo");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => addSite({ handle: h.p.handle, billing: h.p.billing }, u.orgId, `race${i}.example.com`)),
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof SiteError && r.reason.code === "limit_reached")).toBe(true);
    expect((await sitesCount(u.orgId)).n).toBe(3);
    // enforcement is idempotent
    expect(await enforceSiteLimits({ handle: h.p.handle, billing: h.p.billing }, u.orgId)).toEqual({ locked: 0, unlocked: 0 });
  });
});

describe("account deletion", () => {
  it("deleting the account cancels the subscription and removes the org's sites, scans and alerts", async () => {
    const u = await h.signUpVerified("leaver@example.com", "Leaver");
    const sub = await h.subscribe(u.jar, "solo");
    h.web.set("leaver.example.com", healthySite());
    const add = await h.call(sitesPOST, "POST", "/api/sites", { jar: u.jar, body: { url: "leaver.example.com" } });
    expect(add.status).toBe(201);
    let scans = 0;
    for (let i = 0; i < 3 && scans === 0; i++) {
      h.clock.advance(61_000);
      await h.p.scheduler.tick({ budgetMs: 30_000 });
      const r = await h.p.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM scans WHERE org_id = $1`, [u.orgId]);
      scans = r.rows[0]!.n;
    }
    expect(scans).toBe(1);

    const wrong = await h.auth("/delete-user", { jar: u.jar, body: { password: "not-my-password" } });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const del = await h.auth("/delete-user", { jar: u.jar, body: { password: PASSWORD } });
    expect(del.status).toBe(200);

    for (const t of ["sites", "scans", "site_issues", "alerts"]) {
      const { rows } = await h.p.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE org_id = $1`, [u.orgId]);
      expect(rows[0]!.n, t).toBe(0);
    }
    expect(h.stripe.subscriptionsById.get(sub)!.status).toBe("canceled");
    const { rows } = await h.p.handle.executor.query(`SELECT 1 FROM auth_user WHERE email = 'leaver@example.com'`);
    expect(rows.length).toBe(0);
  });
});

describe("no Stripe keys configured", () => {
  it("pricing still works, checkout answers a clear 503, entitlements are free", async () => {
    const handle = createDb("pglite:memory", coreSchema);
    const env = parseSiteproofEnv({ NODE_ENV: "test", APP_URL: "http://localhost:3101", TRUSTED_PROXY: "none" });
    const p = await createPlatform({ env, handle, logger: { debug() {}, info() {}, warn() {}, error() {}, child() { return this; } } });
    installPlatform(p);
    try {
      expect(p.billingEnabled).toBe(false);
      const r = await checkoutHandler(new Request("http://localhost:3101/api/billing/checkout", { method: "POST", body: "{}" }));
      expect(r.status).toBe(503);
      expect((await r.json()).error).toBe("billing_not_configured");
      expect((await p.billing.getEntitlements("some-org")).planId).toBe("free");
    } finally {
      installPlatform(h.p);
      await handle.close();
    }
  });
});
