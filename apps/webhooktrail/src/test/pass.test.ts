/**
 * The one-time 7-day pass through the app's own routes with FakeStripe: checkout -> signed webhook -> claim route
 * (cookie) -> raised limits for viewer actions AND capture-side limits; replay with the pass; expiry, refund and
 * forged cookies fall back to free.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signPassToken } from "@repo/billing";
import type { FakeStripe } from "@repo/billing/testing";
import { createLoopbackTestPolicy } from "@repo/security/testing";
import * as passCheckoutRoute from "@/app/api/billing/pass/checkout/route";
import * as passClaimRoute from "@/app/api/billing/pass/claim/route";
import * as destinationsRoute from "@/app/api/destinations/route";
import * as verifyRoute from "@/app/api/destinations/[id]/verify/route";
import * as claimEndpointsRoute from "@/app/api/endpoints/claim/route";
import * as replayRoute from "@/app/api/endpoints/[id]/requests/[requestId]/replay/route";
import { headersForStorage } from "@/lib/capture";
import { appJobs, APP_QUEUES } from "@/lib/jobs";
import { endpointOwnerLimits } from "@/lib/org-data";
import { PASS_COOKIE, passCookieSecret } from "@/lib/pass";
import type { Platform } from "@/lib/platform";
import type { DestinationDTO, EndpointDTO, PassStatusDTO } from "@/lib/types";
import { sha256Hex } from "@/lib/ids";
import { apiRequest, capture, createEndpoint, ORIGIN, routes, signUpVerified, uniqueEmail, type Jar } from "./helpers";
import { deliverWebhooks, setupPlatform } from "./platform";

let p: Platform;
let fake: FakeStripe;
let server: Server;
let base: string;
const hits: string[] = [];

beforeAll(async () => {
  ({ p, fake } = await setupPlatform({ replayPolicy: createLoopbackTestPolicy() }));
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      hits.push(req.url ?? "/");
      let challenge = "";
      try {
        challenge = (JSON.parse(body) as { challenge?: string }).challenge ?? "";
      } catch {
        /* not JSON */
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, challenge }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const cookieOf = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/** Buys the pass through the app's routes; returns the claim response, the session id and the payment intent. */
async function buyPass(opts: { token?: string | null; jar?: Jar; returnPath?: string }) {
  const res = await passCheckoutRoute.POST(
    apiRequest("POST", "/api/billing/pass/checkout", { token: opts.token, jar: opts.jar, body: { passId: "week", returnPath: opts.returnPath ?? "/" } }),
  );
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  const session = [...fake.sessionsById.values()].find((s) => s.url === url)!;
  const sessionId = session.id as string;
  const pi = fake.completePassCheckout(sessionId);
  expect(await deliverWebhooks(fake)).toEqual([200]);
  const claim = await passClaimRoute.GET(
    new Request(`${ORIGIN}/api/billing/pass/claim?session_id=${sessionId}&next=${encodeURIComponent(opts.returnPath ?? "/")}`),
  );
  return { claim, sessionId, pi };
}

function passCookieFrom(res: Response): string {
  const line = res.headers.getSetCookie().find((l) => l.startsWith(`${PASS_COOKIE}=`));
  expect(line).toBeDefined();
  return line!.split(";")[0]!.slice(PASS_COOKIE.length + 1);
}

async function getEndpoint(id: string, token: string, extraCookie: string) {
  const res = await routes.getEndpoint(id, { token, jar: new Map([[PASS_COOKIE, extraCookie]]) });
  return (await res.json()) as { endpoint: EndpointDTO; pass: PassStatusDTO | null };
}

describe("7-day pass: anonymous purchase", () => {
  it("checkout -> webhook -> claim cookie -> raised viewer and capture limits; refund falls back to free", async () => {
    const first = await createEndpoint();
    const token = first.token;
    expect(first.endpoint.maxRequests).toBe(100);
    expect(first.endpoint.permissions.replayIncluded).toBe(false);

    const { claim, sessionId, pi } = await buyPass({ token, returnPath: `/e/${first.endpoint.id}` });
    expect(claim.status).toBe(303);
    expect(claim.headers.get("location")).toBe(`/e/${first.endpoint.id}?pass=active`);
    const passCookie = passCookieFrom(claim);

    // Viewer: the pass applies, the existing endpoint is upgraded (stored limit, 7-day lifetime from creation).
    const view = await getEndpoint(first.endpoint.id, token, passCookie);
    expect(view.endpoint.permissions.replayIncluded).toBe(true);
    expect(view.endpoint.permissions.canReplay).toBe(false); // replay still needs a workspace
    expect(view.endpoint.maxRequests).toBe(2000);
    expect(view.pass?.name).toBe("7-day pass");
    expect(view.pass?.unlockPath).toContain(sessionId);
    const lifetime = new Date(view.endpoint.expiresAt!).getTime() - new Date(view.endpoint.createdAt).getTime();
    expect(lifetime).toBe(7 * 24 * 3_600_000);

    // Capture side (no cookie on the capture request): the pass is linked to this browser's owner token.
    const ownerHash = sha256Hex(token);
    const lim = await endpointOwnerLimits(p, { org_id: null, anon_owner_hash: ownerHash });
    expect(lim.requestsStored).toBe(2000);
    expect(lim.endpoints).toBe(25);
    const big = await capture(first.endpoint.slug, "POST", { body: "x".repeat(1536 * 1024), headers: { "content-type": "text/plain" } });
    expect(big.status).toBe(200); // free rejects bodies over 1 MB

    // Creating endpoints: 25 with the pass instead of 3.
    const jar = new Map([[PASS_COOKIE, passCookie]]);
    const made: EndpointDTO[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await createEndpoint(token, undefined, jar);
      expect(r.res.status).toBe(201);
      made.push(r.endpoint);
    }
    expect(made[3]!.maxRequests).toBe(2000);
    expect(new Date(made[3]!.expiresAt!).getTime() - new Date(made[3]!.createdAt).getTime()).toBe(7 * 24 * 3_600_000);

    // Without the cookie, this browser's endpoints still have the pass (linked owner) for capture.
    const noCookie = (await (await routes.getEndpoint(first.endpoint.id, token)).json()) as { endpoint: EndpointDTO };
    expect(noCookie.endpoint.permissions.replayIncluded).toBe(true);

    // Full refund: the pass stops working everywhere and limits fall back to free.
    fake.refundPayment(pi);
    expect(await deliverWebhooks(fake)).toEqual([200]);
    expect((await p.billing.getEntitlements(null, { passIds: [sessionId] })).features.replay).toBe(false);
    const after = await getEndpoint(first.endpoint.id, token, passCookie);
    expect(after.endpoint.permissions.replayIncluded).toBe(false);
    expect(after.endpoint.maxRequests).toBe(100);
    expect(after.pass).toBeNull();
    expect((await endpointOwnerLimits(p, { org_id: null, anon_owner_hash: ownerHash })).requestsStored).toBe(100);
    const tooBig = await capture(first.endpoint.slug, "POST", { body: "x".repeat(1536 * 1024), headers: { "content-type": "text/plain" } });
    expect(tooBig.status).toBe(413);
    // The claim link no longer unlocks.
    const again = await passClaimRoute.GET(new Request(`${ORIGIN}/api/billing/pass/claim?session_id=${sessionId}&next=%2F`));
    expect(again.headers.get("location")).toBe("/?pass=revoked");
    expect(again.headers.getSetCookie()).toHaveLength(0);

    // Like a downgrade: the hourly job pauses endpoints above the free count (oldest stay active).
    await appJobs(p)[APP_QUEUES.enforceLimits]!({}, { now: new Date() } as never);
    const { rows } = await p.ex.query<{ id: string; locked_at: Date | null }>(
      `SELECT id, locked_at FROM endpoints WHERE anon_owner_hash = $1 ORDER BY created_at, id`,
      [ownerHash],
    );
    expect(rows.filter((r) => r.locked_at)).toHaveLength(2);
    expect(rows.slice(0, 3).every((r) => !r.locked_at)).toBe(true);
    const locked = rows.find((r) => r.locked_at)!;
    const lockedSlug = (await p.ex.query<{ slug: string }>(`SELECT slug FROM endpoints WHERE id = $1`, [locked.id])).rows[0]!.slug;
    expect((await capture(lockedSlug, "POST", { body: "x" })).status).toBe(423);
  });

  it("an expired pass falls back to free", async () => {
    const e = await createEndpoint();
    const { claim, sessionId } = await buyPass({ token: e.token });
    const cookie = passCookieFrom(claim);
    expect((await getEndpoint(e.endpoint.id, e.token, cookie)).endpoint.permissions.replayIncluded).toBe(true);
    await p.ex.query(`UPDATE billing_passes SET expires_at = now() - interval '1 minute' WHERE id = $1`, [sessionId]);
    const view = await getEndpoint(e.endpoint.id, e.token, cookie);
    expect(view.endpoint.permissions.replayIncluded).toBe(false);
    expect(view.endpoint.maxRequests).toBe(100);
    expect(view.pass).toBeNull();
    expect((await endpointOwnerLimits(p, { org_id: null, anon_owner_hash: sha256Hex(e.token) })).replay).toBe(false);
    const claimAgain = await passClaimRoute.GET(new Request(`${ORIGIN}/api/billing/pass/claim?session_id=${sessionId}&next=%2F`));
    expect(claimAgain.headers.get("location")).toBe("/?pass=expired");
  });

  it("ignores forged pass cookies", async () => {
    const e = await createEndpoint();
    const { sessionId } = await buyPass({ token: null });
    const forged = [
      `${sessionId}.not-the-signature`,
      signPassToken(sessionId, "some-other-secret-that-is-long-enough-0123456789"),
      sessionId,
      signPassToken("cs_test_made_up", passCookieSecret("test-session-secret-0123456789-0123456789-abcdef")),
    ];
    for (const value of forged) {
      const view = await getEndpoint(e.endpoint.id, e.token, value);
      expect(view.endpoint.permissions.replayIncluded, value).toBe(false);
      expect(view.endpoint.maxRequests, value).toBe(100);
      expect(view.pass, value).toBeNull();
    }
    const { rows } = await p.ex.query(`SELECT 1 FROM hp_pass_links WHERE owner_key = $1`, [`anon:${sha256Hex(e.token)}`]);
    expect(rows).toHaveLength(0);
  });

  it("never stores the pass cookie in captured requests", () => {
    const req = new Request(`${ORIGIN}/h/abc`, { headers: { cookie: `${PASS_COOKIE}=secret.sig; theirs=1` } });
    expect(headersForStorage(req)).toEqual([["cookie", "theirs=1"]]);
  });

  it("checkout is same-origin only and refuses unknown passes", async () => {
    const cross = await passCheckoutRoute.POST(
      apiRequest("POST", "/api/billing/pass/checkout", { body: { passId: "week" }, origin: "https://evil.example" }),
    );
    expect(cross.status).toBe(403);
    const unknown = await passCheckoutRoute.POST(apiRequest("POST", "/api/billing/pass/checkout", { body: { passId: "forever" } }));
    expect(unknown.status).toBe(400);
  });
});

describe("7-day pass: replay", () => {
  it("anonymous pass carries into a new workspace: claim endpoints, verify a destination, replay", async () => {
    const anon = await createEndpoint();
    const { claim } = await buyPass({ token: anon.token });
    const passCookie = passCookieFrom(claim);
    const r1 = await capture(anon.endpoint.slug, "POST", { body: JSON.stringify({ hello: "pass" }), headers: { "content-type": "application/json" } });
    const rid = ((await r1.json()) as { id: string }).id;

    // Signs up in the same browser (owner cookie + pass cookie), claims the endpoint.
    const user = await signUpVerified(uniqueEmail("passbuyer"));
    user.jar.set(PASS_COOKIE, passCookie);
    const claimed = await claimEndpointsRoute.POST(apiRequest("POST", "/api/endpoints/claim", { jar: user.jar, token: anon.token, body: {} }));
    expect(((await claimed.json()) as { claimed: number }).claimed).toBe(1);

    const add = await destinationsRoute.POST(apiRequest("POST", "/api/destinations", { jar: user.jar, body: { name: "staging", url: `${base}/hook` } }));
    expect(add.status).toBe(201);
    const dest = ((await add.json()) as { destination: DestinationDTO }).destination;
    const v = await verifyRoute.POST(apiRequest("POST", `/api/destinations/${dest.id}/verify`, { jar: user.jar }), {
      params: Promise.resolve({ id: dest.id }),
    });
    expect(((await v.json()) as { verified: boolean }).verified).toBe(true);

    const replay = await replayRoute.POST(
      apiRequest("POST", `/api/endpoints/${anon.endpoint.id}/requests/${rid}/replay`, { jar: user.jar, body: { destinationId: dest.id } }),
      { params: Promise.resolve({ id: anon.endpoint.id, requestId: rid }) },
    );
    expect(replay.status).toBe(201);
    expect(((await replay.json()) as { replays: { status: string }[] }).replays[0]!.status).toBe("delivered");
    expect(hits).toContain("/hook");

    // The workspace keeps the pass server-side (linked), e.g. for scheduled replay retries without a cookie.
    const { rows } = await p.ex.query(`SELECT 1 FROM hp_pass_links WHERE owner_key = $1`, [`org:${user.orgId}`]);
    expect(rows).toHaveLength(1);
  });

  it("a pass bought while signed in counts for the workspace (org-bound)", async () => {
    const user = await signUpVerified(uniqueEmail("orgpass"));
    expect((await p.billing.getEntitlements(user.orgId)).features.replay).toBe(false);
    const free = await destinationsRoute.POST(apiRequest("POST", "/api/destinations", { jar: user.jar, body: { name: "x", url: `${base}/a` } }));
    expect(free.status).toBe(403);
    await buyPass({ jar: user.jar });
    const ent = await p.billing.getEntitlements(user.orgId);
    expect(ent.features.replay).toBe(true);
    expect(ent.limits.endpoints).toBe(25);
    expect(ent.pass?.passId).toBe("week");
    const ok = await destinationsRoute.POST(apiRequest("POST", "/api/destinations", { jar: user.jar, body: { name: "x", url: `${base}/a` } }));
    expect(ok.status).toBe(201);
  });

  it("free users without a pass still cannot replay", async () => {
    const user = await signUpVerified(uniqueEmail("nopass"));
    const e = await createEndpoint(undefined, undefined, user.jar);
    expect(e.endpoint.permissions.canReplay).toBe(false);
    expect(e.endpoint.permissions.replayIncluded).toBe(false);
  });
});
