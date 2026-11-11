import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as endpointsRoute from "@/app/api/endpoints/route";
import { getDb } from "@/lib/db";
import { sha256Hex } from "@/lib/ids";
import { limits } from "@/lib/plans";
import type { EndpointDTO, RequestListDTO } from "@/lib/types";
import { apiRequest, capture, createEndpoint, freshIp, routes } from "./helpers";

const saved = { ...limits };
afterEach(() => Object.assign(limits, saved));
beforeAll(async () => {
  await getDb();
});

describe("anonymous endpoint creation", () => {
  it("creates an endpoint, sets a hardened owner cookie and stores only the token hash", async () => {
    const { res, token, endpoint } = await createEndpoint();
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api/);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(endpoint.slug).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(endpoint.captureUrl).toBe(`http://localhost:3003/h/${endpoint.slug}`);
    const hours = (Date.parse(endpoint.expiresAt) - Date.parse(endpoint.createdAt)) / 3_600_000;
    expect(hours).toBe(24);
    const { executor } = await getDb();
    const { rows } = await executor.query<{ anon_owner_hash: string }>(`SELECT anon_owner_hash FROM endpoints WHERE id = $1`, [endpoint.id]);
    expect(rows[0]!.anon_owner_hash).toBe(sha256Hex(token));
    const all = await executor.query(`SELECT * FROM endpoints WHERE anon_owner_hash = $1 OR slug = $1`, [token]);
    expect(all.rows).toHaveLength(0);
  });

  it("reuses the existing owner token and does not reset the cookie", async () => {
    const first = await createEndpoint();
    const second = await createEndpoint(first.token);
    expect(second.res.headers.get("set-cookie")).toBeNull();
    const list = (await (await routes.listEndpoints(first.token)).json()) as { endpoints: EndpointDTO[] };
    expect(list.endpoints.map((e) => e.id).sort()).toEqual([first.endpoint.id, second.endpoint.id].sort());
  });

  it("limits active anonymous endpoints per owner token", async () => {
    const a = await createEndpoint();
    await createEndpoint(a.token);
    await createEndpoint(a.token);
    const fourth = await createEndpoint(a.token);
    expect(fourth.res.status).toBe(429);
    // expiring one frees a slot
    const { executor } = await getDb();
    await executor.query(`UPDATE endpoints SET expires_at = now() - interval '1 second' WHERE id = $1`, [a.endpoint.id]);
    expect((await createEndpoint(a.token)).res.status).toBe(201);
  });

  it("rate-limits creation per IP", async () => {
    limits.createPerIpPerHour = 2;
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await createEndpoint(null, ip)).res.status);
    expect(statuses).toEqual([201, 201, 429]);
  });

  it("rejects cross-origin and non-JSON creation (CSRF)", async () => {
    const noOrigin = await endpointsRoute.POST(apiRequest("POST", "/api/endpoints", { body: {}, origin: null }));
    expect(noOrigin.status).toBe(403);
    const evil = await endpointsRoute.POST(apiRequest("POST", "/api/endpoints", { body: {}, origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    const crossSite = await endpointsRoute.POST(
      apiRequest("POST", "/api/endpoints", { body: {}, headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(crossSite.status).toBe(403);
    const form = await endpointsRoute.POST(
      new Request("http://localhost:3003/api/endpoints", {
        method: "POST",
        headers: { origin: "http://localhost:3003", "content-type": "application/x-www-form-urlencoded" },
        body: "name=x",
      }),
    );
    expect(form.status).toBe(415);
  });
});

describe("ownership isolation", () => {
  it("another owner gets 404 for every read and write, and nothing changes", async () => {
    const alice = await createEndpoint();
    const bob = await createEndpoint();
    const cap = await capture(alice.endpoint.slug, "POST", { body: "secret" });
    const rid = ((await cap.json()) as { id: string }).id;
    const id = alice.endpoint.id;

    expect((await routes.getEndpoint(id, bob.token)).status).toBe(404);
    expect((await routes.getEndpoint(id)).status).toBe(404); // no cookie at all
    expect((await routes.listRequests(id, bob.token)).status).toBe(404);
    expect((await routes.getRequest(id, rid, bob.token)).status).toBe(404);
    expect((await routes.deleteRequest(id, rid, bob.token)).status).toBe(404);
    expect((await routes.clearRequests(id, bob.token)).status).toBe(404);
    expect((await routes.patchEndpoint(id, bob.token, { name: "pwned" })).status).toBe(404);
    expect((await routes.deleteEndpoint(id, bob.token)).status).toBe(404);
    // Bob cannot reach Alice's request through his own endpoint id either.
    expect((await routes.getRequest(bob.endpoint.id, rid, bob.token)).status).toBe(404);

    const bobList = (await (await routes.listEndpoints(bob.token)).json()) as { endpoints: EndpointDTO[] };
    expect(bobList.endpoints.map((e) => e.id)).toEqual([bob.endpoint.id]);

    const still = (await (await routes.getEndpoint(id, alice.token)).json()) as { endpoint: EndpointDTO };
    expect(still.endpoint.name).toBe("Untitled endpoint");
    expect((await routes.getRequest(id, rid, alice.token)).status).toBe(200);
  });

  it("returns 404 for malformed ids and for unknown request ids", async () => {
    const a = await createEndpoint();
    expect((await routes.getEndpoint("not-a-uuid", a.token)).status).toBe(404);
    expect((await routes.getRequest(a.endpoint.id, "00000000-0000-0000-0000-000000000000", a.token)).status).toBe(404);
  });
});

describe("inspection API", () => {
  it("paginates with cursors and polls with ?after", async () => {
    const { endpoint, token } = await createEndpoint();
    for (let i = 1; i <= 7; i++) await capture(endpoint.slug, "POST", { path: `/p${i}`, body: String(i) });
    const page1 = (await (await routes.listRequests(endpoint.id, token, "?limit=3")).json()) as RequestListDTO;
    expect(page1.requests.map((r) => r.path)).toEqual(["/p7", "/p6", "/p5"]);
    const page2 = (await (await routes.listRequests(endpoint.id, token, `?limit=3&before=${page1.nextCursor}`)).json()) as RequestListDTO;
    expect(page2.requests.map((r) => r.path)).toEqual(["/p4", "/p3", "/p2"]);
    const page3 = (await (await routes.listRequests(endpoint.id, token, `?limit=3&before=${page2.nextCursor}`)).json()) as RequestListDTO;
    expect(page3.requests.map((r) => r.path)).toEqual(["/p1"]);
    expect(page3.nextCursor).toBeNull();

    const newest = page1.requests[0]!.cursor;
    const none = (await (await routes.listRequests(endpoint.id, token, `?after=${newest}`)).json()) as RequestListDTO;
    expect(none.requests).toHaveLength(0);
    await capture(endpoint.slug, "PUT", { path: "/p8", body: "8" });
    await capture(endpoint.slug, "PUT", { path: "/p9", body: "9" });
    const fresh = (await (await routes.listRequests(endpoint.id, token, `?after=${newest}`)).json()) as RequestListDTO;
    expect(fresh.requests.map((r) => r.path)).toEqual(["/p9", "/p8"]);
  });

  it("filters by method, time range and searches path, headers and body (wildcards literal)", async () => {
    const { endpoint, token } = await createEndpoint();
    await capture(endpoint.slug, "POST", { path: "/stripe", body: JSON.stringify({ type: "invoice.paid" }), headers: { "content-type": "application/json" } });
    await capture(endpoint.slug, "GET", { path: "/health" });
    await capture(endpoint.slug, "PUT", { path: "/x", headers: { "x-github-event": "push" } });
    await capture(endpoint.slug, "POST", { path: "/pct", body: "100% done" });
    await capture(endpoint.slug, "POST", { path: "/utf", body: "Grüße aus Köln" });
    const q = async (query: string) =>
      ((await (await routes.listRequests(endpoint.id, token, query)).json()) as RequestListDTO).requests.map((r) => r.path);

    expect(await q("?method=GET")).toEqual(["/health"]);
    expect(await q("?q=INVOICE.PAID")).toEqual(["/stripe"]);
    expect(await q("?q=github-event")).toEqual(["/x"]);
    expect(await q("?q=heal")).toEqual(["/health"]);
    expect(await q("?q=100%25")).toEqual(["/pct"]);
    expect(await q("?q=_")).toEqual([]); // literal underscore, not a wildcard
    expect(await q("?q=Köln")).toEqual(["/utf"]);
    expect(await q("?method=POST&q=done")).toEqual(["/pct"]);
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(await q(`?from=${future}`)).toEqual([]);
    expect((await q(`?from=${past}&to=${future}`)).length).toBe(5);

    expect((await routes.listRequests(endpoint.id, token, "?method=TRACE")).status).toBe(400);
    expect((await routes.listRequests(endpoint.id, token, `?q=${"a".repeat(201)}`)).status).toBe(400);
    expect((await routes.listRequests(endpoint.id, token, "?before=abc")).status).toBe(400);
  });

  it("deletes single requests and clears all", async () => {
    const { endpoint, token } = await createEndpoint();
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(((await (await capture(endpoint.slug, "POST", { body: "x" })).json()) as { id: string }).id);
    expect((await routes.deleteRequest(endpoint.id, ids[0]!, token)).status).toBe(200);
    expect((await routes.getRequest(endpoint.id, ids[0]!, token)).status).toBe(404);
    const cleared = (await (await routes.clearRequests(endpoint.id, token)).json()) as { deleted: number };
    expect(cleared.deleted).toBe(2);
    const after = (await (await routes.listRequests(endpoint.id, token)).json()) as RequestListDTO;
    expect(after.requests).toHaveLength(0);
  });

  it("renames, changes expiry within plan limits and deletes", async () => {
    const { endpoint, token } = await createEndpoint();
    const r = await routes.patchEndpoint(endpoint.id, token, { name: "Stripe test", expiresInHours: 2 });
    expect(r.status).toBe(200);
    const updated = ((await r.json()) as { endpoint: EndpointDTO }).endpoint;
    expect(updated.name).toBe("Stripe test");
    const hoursLeft = (Date.parse(updated.expiresAt) - Date.now()) / 3_600_000;
    expect(hoursLeft).toBeGreaterThan(1.9);
    expect(hoursLeft).toBeLessThanOrEqual(2);
    expect((await routes.patchEndpoint(endpoint.id, token, { expiresInHours: 25 })).status).toBe(400);
    expect((await routes.patchEndpoint(endpoint.id, token, { expiresInHours: 0 })).status).toBe(400);
    expect((await routes.patchEndpoint(endpoint.id, token, { name: "" })).status).toBe(400);
    expect((await routes.patchEndpoint(endpoint.id, token, { bogus: 1 })).status).toBe(400);

    // Lifetime cap: an endpoint created 7 days ago cannot be extended past created_at + 7d.
    const { executor } = await getDb();
    await executor.query(
      `UPDATE endpoints SET created_at = now() - interval '7 days' + interval '1 hour', expires_at = now() + interval '30 minutes' WHERE id = $1`,
      [endpoint.id],
    );
    const capped = ((await (await routes.patchEndpoint(endpoint.id, token, { expiresInHours: 24 })).json()) as { endpoint: EndpointDTO }).endpoint;
    expect((Date.parse(capped.expiresAt) - Date.now()) / 3_600_000).toBeLessThan(1.01);

    expect((await routes.patchEndpoint(endpoint.id, token, { name: "x" }, "https://evil.example")).status).toBe(403);
    expect((await routes.deleteEndpoint(endpoint.id, token, "https://evil.example")).status).toBe(403);
    expect((await routes.deleteEndpoint(endpoint.id, token)).status).toBe(200);
    expect((await routes.getEndpoint(endpoint.id, token)).status).toBe(404);
  });

  it("answers 410 for request reads on an expired endpoint", async () => {
    const { endpoint, token } = await createEndpoint();
    const { executor } = await getDb();
    await executor.query(`UPDATE endpoints SET expires_at = now() - interval '1 second' WHERE id = $1`, [endpoint.id]);
    expect((await routes.listRequests(endpoint.id, token)).status).toBe(410);
    const ep = (await (await routes.getEndpoint(endpoint.id, token)).json()) as { endpoint: EndpointDTO };
    expect(ep.endpoint.expired).toBe(true);
  });

  it("rate-limits the API per IP", async () => {
    limits.apiPerIpPerMinute = 2;
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await endpointsRoute.GET(apiRequest("GET", "/api/endpoints", { ip }))).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});
