import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as claimRoute from "@/app/api/endpoints/claim/route";
import * as endpointsRoute from "@/app/api/endpoints/route";
import * as endpointRoute from "@/app/api/endpoints/[id]/route";
import * as requestsRoute from "@/app/api/endpoints/[id]/requests/route";
import * as requestRoute from "@/app/api/endpoints/[id]/requests/[requestId]/route";
import * as replayRoute from "@/app/api/endpoints/[id]/requests/[requestId]/replay/route";
import * as destinationsRoute from "@/app/api/destinations/route";
import * as destinationRoute from "@/app/api/destinations/[id]/route";
import * as verifyRoute from "@/app/api/destinations/[id]/verify/route";
import * as checkoutRoute from "@/app/api/billing/checkout/route";
import * as portalRoute from "@/app/api/billing/portal/route";
import { limits } from "@/lib/plans";
import type { RequestDetailDTO } from "@/lib/types";
import { apiRequest, capture, createEndpoint, ORIGIN, routes, signUpVerified, uniqueEmail } from "./helpers";
import { setupPlatform } from "./platform";

beforeAll(async () => {
  await setupPlatform();
});
const saved = { ...limits };
afterEach(() => Object.assign(limits, saved));

describe("client IP handling (TRUSTED_PROXY=fly in tests)", () => {
  // The per-IP limit is a fixed one-minute window. Start each test just after a minute boundary (clock still
  // ticks) so a burst of requests never straddles two windows and gets its count reset halfway through.
  beforeEach(() => {
    const nextMinute = Math.floor(Date.now() / 60_000) * 60_000 + 60_000;
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true, now: nextMinute + 1_000 });
  });
  afterEach(() => vi.useRealTimers());

  it("a spoofed X-Forwarded-For / X-Real-IP cannot dodge the per-IP capture limit", async () => {
    limits.capturePerIpPerMinute = 3;
    const { endpoint } = await createEndpoint();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await capture(endpoint.slug, "POST", {
        body: "x",
        headers: { "fly-client-ip": "203.0.113.50", "x-forwarded-for": `198.51.100.${i}`, "x-real-ip": `192.0.2.${i}` },
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
  });

  it("IPv6 clients are bucketed per /64 (rotating the interface id does not help)", async () => {
    limits.capturePerIpPerMinute = 2;
    const { endpoint } = await createEndpoint();
    const statuses: number[] = [];
    for (let i = 1; i <= 4; i++) {
      statuses.push((await capture(endpoint.slug, "POST", { body: "x", headers: { "fly-client-ip": `2001:db8:1:2::${i}` } })).status);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("a duplicated Fly-Client-IP header is not trusted (shared unknown bucket, never a free pass)", async () => {
    limits.capturePerIpPerMinute = 1;
    const { endpoint } = await createEndpoint();
    const a = await capture(endpoint.slug, "POST", { body: "x", headers: { "fly-client-ip": "203.0.113.9, 203.0.113.10" } });
    const b = await capture(endpoint.slug, "POST", { body: "x", headers: { "fly-client-ip": "203.0.113.11, 203.0.113.12" } });
    expect([a.status, b.status]).toEqual([200, 429]);
  });

  it("stores the trusted client IP, never the spoofed one", async () => {
    const { endpoint, token } = await createEndpoint();
    const res = await capture(endpoint.slug, "POST", { body: "x", headers: { "fly-client-ip": "203.0.113.77", "x-forwarded-for": "6.6.6.6" } });
    const id = ((await res.json()) as { id: string }).id;
    const d = ((await (await routes.getRequest(endpoint.id, id, token)).json()) as { request: RequestDetailDTO }).request;
    expect(d.sourceIp).toBe("203.0.113.77");
  });
});

describe("CSRF: every mutating route requires our Origin", () => {
  it("refuses foreign or missing Origin with 403 before doing anything", async () => {
    const u = await signUpVerified(uniqueEmail("csrf"));
    const { endpoint } = await createEndpoint(undefined, undefined, u.jar);
    const id = endpoint.id;
    const rid = "00000000-0000-4000-8000-000000000001";
    const did = "00000000-0000-4000-8000-000000000002";
    const params = <T>(v: T) => ({ params: Promise.resolve(v) });
    for (const origin of ["https://evil.example", null]) {
      const o = { jar: u.jar, origin, body: {} };
      const calls: [string, Promise<Response>][] = [
        ["create", endpointsRoute.POST(apiRequest("POST", "/api/endpoints", o))],
        ["claim", claimRoute.POST(apiRequest("POST", "/api/endpoints/claim", o))],
        ["patch", endpointRoute.PATCH(apiRequest("PATCH", `/api/endpoints/${id}`, { ...o, body: { name: "x" } }), params({ id }))],
        ["delete", endpointRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}`, o), params({ id }))],
        ["clear", requestsRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}/requests`, o), params({ id }))],
        ["delreq", requestRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}/requests/${rid}`, o), params({ id, requestId: rid }))],
        ["replay", replayRoute.POST(apiRequest("POST", `/api/endpoints/${id}/requests/${rid}/replay`, o), params({ id, requestId: rid }))],
        ["adddest", destinationsRoute.POST(apiRequest("POST", "/api/destinations", o))],
        ["patchdest", destinationRoute.PATCH(apiRequest("PATCH", `/api/destinations/${did}`, o), params({ id: did }))],
        ["deldest", destinationRoute.DELETE(apiRequest("DELETE", `/api/destinations/${did}`, o), params({ id: did }))],
        ["verify", verifyRoute.POST(apiRequest("POST", `/api/destinations/${did}/verify`, o), params({ id: did }))],
        ["checkout", checkoutRoute.POST(apiRequest("POST", "/api/billing/checkout", { ...o, body: { planId: "pro" } }))],
        ["portal", portalRoute.POST(apiRequest("POST", "/api/billing/portal", o))],
      ];
      for (const [name, call] of calls) expect((await call).status, `${name} origin=${origin}`).toBe(403);
    }
    // The endpoint is untouched.
    expect((await routes.getEndpoint(id, { jar: u.jar })).status).toBe(200);
  });

  it("refuses requests labelled cross-site by the browser even with a matching Origin", async () => {
    const u = await signUpVerified(uniqueEmail("site"));
    const res = await endpointsRoute.POST(
      apiRequest("POST", "/api/endpoints", { jar: u.jar, body: {}, origin: ORIGIN, headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("capture never stores WebhookTrail's own cookies", () => {
  it("strips the session cookie (any prefix) and the owner cookie from captured headers", async () => {
    const { endpoint, token } = await createEndpoint();
    const res = await capture(endpoint.slug, "GET", {
      headers: { cookie: `wt.session_token=abc.def; __Secure-wt.session_token=ghi; wt_owner=${token}; theirs=1` },
    });
    const id = ((await res.json()) as { id: string }).id;
    const d = ((await (await routes.getRequest(endpoint.id, id, token)).json()) as { request: RequestDetailDTO }).request;
    expect(d.headers).toContainEqual(["cookie", "theirs=1"]);
    expect(JSON.stringify(d.headers)).not.toMatch(/session_token|abc\.def|ghi/);
  });
});
