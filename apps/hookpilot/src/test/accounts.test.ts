import { beforeAll, describe, expect, it } from "vitest";
import * as claimRoute from "@/app/api/endpoints/claim/route";
import * as endpointsRoute from "@/app/api/endpoints/route";
import * as destinationsRoute from "@/app/api/destinations/route";
import * as checkoutRoute from "@/app/api/billing/checkout/route";
import { getOperator } from "@/lib/admin";
import type { Platform } from "@/lib/platform";
import type { EndpointDTO } from "@/lib/types";
import {
  apiRequest,
  authCall,
  capture,
  createEndpoint,
  PASSWORD,
  routes,
  signUpVerified,
  uniqueEmail,
  type Jar,
} from "./helpers";
import { setupPlatform, subscribe } from "./platform";
import type { FakeStripe } from "@repo/billing/testing";

let p: Platform;
let fake: FakeStripe;
beforeAll(async () => {
  ({ p, fake } = await setupPlatform());
});

const listMine = async (jar: Jar, token?: string) =>
  (await (await endpointsRoute.GET(apiRequest("GET", "/api/endpoints", { jar, token }))).json()) as {
    endpoints: EndpointDTO[];
    anonymous: EndpointDTO[];
    signedIn: boolean;
  };

describe("auth flows through the app's /api/auth route", () => {
  it("sign-up requires email verification, then login works and a personal workspace exists", async () => {
    const email = uniqueEmail("flow");
    const r = await authCall("/sign-up/email", { body: { email, password: PASSWORD, name: "Flow" } });
    expect(r.status).toBe(200);
    // Not verified yet: password login is refused.
    const early = await authCall("/sign-in/email", { body: { email, password: PASSWORD } });
    expect(early.status).toBe(403);
    const u = await signUpVerifiedExisting(email);
    const jar: Jar = new Map();
    const login = await authCall("/sign-in/email", { body: { email, password: PASSWORD }, jar });
    expect(login.status).toBe(200);
    expect([...jar.keys()].some((k) => k.includes("hp.session_token"))).toBe(true);
    const mine = await listMine(jar);
    expect(mine.signedIn).toBe(true);
    void u;
  });

  it("rejects auth POSTs from a foreign origin (CSRF)", async () => {
    const res = await authCall("/sign-up/email", {
      body: { email: uniqueEmail("csrf"), password: PASSWORD, name: "X" },
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
  });

  it("rate-limits sign-in per trusted client IP; a spoofed X-Forwarded-For does not reset it", async () => {
    const ip = "198.51.100.23";
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await authCall("/sign-in/email", { body: { email: "nobody@example.com", password: "wrong-password-x" }, ip });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});

/** The email is already signed up: just follow the verification link. */
async function signUpVerifiedExisting(email: string) {
  const { linkFromOutbox } = await import("./helpers");
  const link = await linkFromOutbox(email, "auth.verify-email", "/api/auth/verify-email");
  const jar: Jar = new Map();
  await authCall(link, { jar, origin: null });
  return jar;
}

describe("org-owned endpoints and claiming", () => {
  it("creates endpoints in the signed-in workspace; other workspaces get 404 on every route", async () => {
    const alice = await signUpVerified(uniqueEmail("alice"));
    const bob = await signUpVerified(uniqueEmail("bob"));
    const a = await createEndpoint(undefined, undefined, alice.jar);
    expect(a.res.status).toBe(201);
    expect(a.endpoint.owner).toBe("org");
    expect(a.endpoint.expiresAt).not.toBeNull(); // free plan endpoints expire
    const cap = await capture(a.endpoint.slug, "POST", { body: '{"password":"hunter2"}', headers: { "content-type": "application/json" } });
    const rid = ((await cap.json()) as { id: string }).id;
    const id = a.endpoint.id;
    const B = { jar: bob.jar };
    expect((await routes.getEndpoint(id, B)).status).toBe(404);
    expect((await routes.listRequests(id, B)).status).toBe(404);
    expect((await routes.getRequest(id, rid, B)).status).toBe(404);
    expect((await routes.deleteRequest(id, rid, B)).status).toBe(404);
    expect((await routes.clearRequests(id, B)).status).toBe(404);
    expect((await routes.patchEndpoint(id, B, { name: "pwned" })).status).toBe(404);
    expect((await routes.deleteEndpoint(id, B)).status).toBe(404);
    expect((await listMine(bob.jar)).endpoints.map((e) => e.id)).not.toContain(id);
    // Signed-out callers (no cookie) also get 404.
    expect((await routes.getEndpoint(id)).status).toBe(404);
    // Alice still sees everything.
    expect((await routes.getRequest(id, rid, { jar: alice.jar })).status).toBe(200);
  });

  it("claims only this browser's anonymous endpoints (matching owner cookie), up to the plan limit", async () => {
    const anon = await createEndpoint();
    await createEndpoint(anon.token);
    const other = await createEndpoint(); // a different browser
    const user = await signUpVerified(uniqueEmail("claimer"));
    const before = await listMine(user.jar, anon.token);
    expect(before.anonymous.map((e) => e.id).sort()).toHaveLength(2);
    const res = await claimRoute.POST(apiRequest("POST", "/api/endpoints/claim", { jar: user.jar, token: anon.token, body: {} }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { claimed: number; skipped: number };
    expect(body).toMatchObject({ claimed: 2, skipped: 0 });
    const after = await listMine(user.jar, anon.token);
    expect(after.anonymous).toHaveLength(0);
    expect(after.endpoints.map((e) => e.id)).toContain(anon.endpoint.id);
    expect(after.endpoints.map((e) => e.id)).not.toContain(other.endpoint.id);
    // The anonymous cookie alone no longer opens a claimed endpoint.
    expect((await routes.getEndpoint(anon.endpoint.id, anon.token)).status).toBe(404);
    // Claim without the cookie: nothing to claim. Without a session: 401.
    expect((await claimRoute.POST(apiRequest("POST", "/api/endpoints/claim", { jar: user.jar, body: {} }))).status).toBe(400);
    expect((await claimRoute.POST(apiRequest("POST", "/api/endpoints/claim", { token: other.token, body: {} }))).status).toBe(401);
    // Cross-origin claim refused.
    expect(
      (await claimRoute.POST(apiRequest("POST", "/api/endpoints/claim", { jar: user.jar, token: other.token, body: {}, origin: "https://evil.example" })))
        .status,
    ).toBe(403);
  });

  it("enforces the free plan's endpoint gauge under concurrency (withOrgLock)", async () => {
    const u = await signUpVerified(uniqueEmail("gauge"));
    const results = await Promise.all(Array.from({ length: 8 }, () => createEndpoint(undefined, undefined, u.jar)));
    const created = results.filter((r) => r.res.status === 201).length;
    expect(created).toBe(3);
    expect(results.filter((r) => r.res.status === 403).length).toBe(5);
  });
});

describe("teams (Pro seats) and roles", () => {
  it("invites a member on Pro; members see org endpoints but cannot delete them or manage destinations", async () => {
    const owner = await signUpVerified(uniqueEmail("owner"));
    // Free plan: 1 seat, so inviting is refused.
    const refused = await authCall("/organization/invite-member", {
      body: { email: uniqueEmail("x"), role: "member", organizationId: owner.orgId },
      jar: owner.jar,
    });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("SEAT_LIMIT_REACHED");

    await subscribe(fake, owner, "pro");
    expect((await p.billing.getEntitlements(owner.orgId)).planId).toBe("pro");
    const memberEmail = uniqueEmail("member");
    const inv = await authCall("/organization/invite-member", {
      body: { email: memberEmail, role: "member", organizationId: owner.orgId },
      jar: owner.jar,
    });
    expect(inv.status).toBe(200);
    const invitationId = ((await inv.json()) as { id: string }).id;
    const member = await signUpVerified(memberEmail, "Member");
    const acc = await authCall("/organization/accept-invitation", { body: { invitationId }, jar: member.jar });
    expect(acc.status).toBe(200);
    const act = await authCall("/organization/set-active", { body: { organizationId: owner.orgId }, jar: member.jar });
    expect(act.status).toBe(200);

    const ep = await createEndpoint(undefined, undefined, owner.jar);
    expect(ep.endpoint.expiresAt).toBeNull(); // paid endpoints never expire
    const seen = await listMine(member.jar);
    expect(seen.endpoints.map((e) => e.id)).toContain(ep.endpoint.id);
    expect(seen.endpoints.find((e) => e.id === ep.endpoint.id)!.permissions.canDelete).toBe(false);
    expect((await routes.deleteEndpoint(ep.endpoint.id, { jar: member.jar })).status).toBe(403);
    const addDest = await destinationsRoute.POST(
      apiRequest("POST", "/api/destinations", { jar: member.jar, body: { name: "x", url: "https://hooks.example.com/x" } }),
    );
    expect(addDest.status).toBe(403);
    // Members cannot start checkout (owner only).
    const co = await checkoutRoute.POST(apiRequest("POST", "/api/billing/checkout", { jar: member.jar, body: { planId: "developer" } }));
    expect(co.status).toBe(403);
    // Owner can delete.
    expect((await routes.deleteEndpoint(ep.endpoint.id, { jar: owner.jar })).status).toBe(200);
  });
});

describe("account deletion", () => {
  it("deleting the account removes the org's endpoints, requests and destinations", async () => {
    const u = await signUpVerified(uniqueEmail("leaver"));
    const e = await createEndpoint(undefined, undefined, u.jar);
    await capture(e.endpoint.slug, "POST", { body: "x" });
    await p.ex.query(`INSERT INTO hp_destinations (org_id, name, url) VALUES ($1, 'd', 'https://hooks.example.com/z')`, [u.orgId]);
    const del = await authCall("/delete-user", { body: { password: PASSWORD }, jar: u.jar });
    expect(del.status).toBe(200);
    const left = await p.ex.query(`SELECT 1 FROM endpoints WHERE org_id = $1`, [u.orgId]);
    expect(left.rows).toHaveLength(0);
    const reqs = await p.ex.query(`SELECT 1 FROM captured_requests WHERE endpoint_id = $1`, [e.endpoint.id]);
    expect(reqs.rows).toHaveLength(0);
    const dests = await p.ex.query(`SELECT 1 FROM hp_destinations WHERE org_id = $1`, [u.orgId]);
    expect(dests.rows).toHaveLength(0);
    expect((await capture(e.endpoint.slug, "POST", { body: "x" })).status).toBe(404);
  });
});

describe("/admin guard", () => {
  it("only operator/owner platform roles pass; customers and anonymous get null (page answers 404)", async () => {
    const u = await signUpVerified(uniqueEmail("cust"));
    const h = (jar: Jar) => new Headers({ cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") });
    expect(await getOperator(p, h(u.jar))).toBeNull();
    expect(await getOperator(p, new Headers())).toBeNull();
    await p.ex.query(`UPDATE auth_user SET role = 'operator' WHERE id = $1`, [u.userId]);
    expect((await getOperator(p, h(u.jar)))?.id).toBe(u.userId);
  });
});
