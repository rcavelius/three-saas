import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { limits, PLANS } from "@/lib/plans";
import type { RequestDetailDTO, RequestListDTO } from "@/lib/types";
import { capture, createEndpoint, routes } from "./helpers";

const saved = { ...limits };
const savedFree = { ...PLANS.free };
afterEach(() => {
  Object.assign(limits, saved);
  Object.assign(PLANS.free, savedFree);
});

beforeAll(async () => {
  await getDb();
});

async function list(id: string, token: string, query = ""): Promise<RequestListDTO> {
  const res = await routes.listRequests(id, token, query);
  expect(res.status).toBe(200);
  return (await res.json()) as RequestListDTO;
}

async function detail(id: string, rid: string, token: string): Promise<RequestDetailDTO> {
  const res = await routes.getRequest(id, rid, token);
  expect(res.status).toBe(200);
  return ((await res.json()) as { request: RequestDetailDTO }).request;
}

describe("capture", () => {
  it("captures every supported method with path, query, headers and body", async () => {
    const { endpoint, token } = await createEndpoint();
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    for (const m of methods) {
      const hasBody = !["GET", "HEAD", "OPTIONS"].includes(m);
      const res = await capture(endpoint.slug, m, {
        path: `/orders/42?m=${m}&x=1`,
        headers: { "content-type": "application/json", "x-test": m },
        body: hasBody ? JSON.stringify({ method: m }) : undefined,
      });
      expect(res.status, m).toBe(200);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
      if (m === "HEAD") {
        expect(await res.text()).toBe("");
      } else {
        const body = (await res.json()) as { ok: boolean; id: string };
        expect(body.ok).toBe(true);
        expect(body.id).toBe(res.headers.get("x-hookpilot-request-id"));
      }
    }
    const { requests } = await list(endpoint.id, token);
    expect(requests.map((r) => r.method)).toEqual([...methods].reverse());
    const post = requests.find((r) => r.method === "POST")!;
    expect(post.path).toBe("/orders/42");
    expect(post.query).toBe("m=POST&x=1");
    const d = await detail(endpoint.id, post.id, token);
    expect(Buffer.from(d.bodyBase64, "base64").toString()).toBe('{"method":"POST"}');
    expect(d.bodySize).toBe(17);
    expect(d.truncated).toBe(false);
    expect(d.headers).toContainEqual(["x-test", "POST"]);
    expect(d.contentType).toBe("application/json");
    const opts = await capture(endpoint.slug, "OPTIONS", { headers: { "access-control-request-headers": "content-type, x-sig" } });
    expect(opts.headers.get("access-control-allow-headers")).toBe("content-type, x-sig");
  });

  it("stores binary bodies byte-for-byte", async () => {
    const { endpoint, token } = await createEndpoint();
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 0x80, 10, 13]);
    const res = await capture(endpoint.slug, "POST", { body: bytes, headers: { "content-type": "application/octet-stream" } });
    const id = ((await res.json()) as { id: string }).id;
    const d = await detail(endpoint.id, id, token);
    expect([...Buffer.from(d.bodyBase64, "base64")]).toEqual([...bytes]);
  });

  it("truncates bodies above the stored cap but keeps the true size", async () => {
    const { endpoint, token } = await createEndpoint();
    const size = PLANS.free.storedBodyBytes + 5000;
    const res = await capture(endpoint.slug, "POST", { body: "a".repeat(size), headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(200);
    const id = ((await res.json()) as { id: string }).id;
    const d = await detail(endpoint.id, id, token);
    expect(d.bodySize).toBe(size);
    expect(d.truncated).toBe(true);
    expect(d.storedBodySize).toBe(PLANS.free.storedBodyBytes);
  });

  it("rejects bodies over the hard cap with 413 from Content-Length, without storing", async () => {
    const { endpoint, token } = await createEndpoint();
    const res = await capture(endpoint.slug, "POST", { body: "x".repeat(PLANS.free.maxBodyBytes + 1) });
    expect(res.status).toBe(413);
    expect((await list(endpoint.id, token)).requests).toHaveLength(0);
  });

  it("rejects a streamed body (no Content-Length) with 413 and stops reading early", async () => {
    const { endpoint, token } = await createEndpoint();
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled > 1000) controller.close(); // would be ~64 MB if fully consumed
        else controller.enqueue(chunk);
      },
    });
    const res = await capture(endpoint.slug, "POST", { body: stream });
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(40); // stopped just past 1 MB
    expect((await list(endpoint.id, token)).requests).toHaveLength(0);
  });

  it("returns 404 for unknown and malformed slugs", async () => {
    expect((await capture("A".repeat(24), "POST", { body: "x" })).status).toBe(404);
    expect((await capture("short", "GET")).status).toBe(404);
  });

  it("returns 410 for expired endpoints and 404 for deleted ones", async () => {
    const { endpoint, token } = await createEndpoint();
    const { executor } = await getDb();
    await executor.query(`UPDATE endpoints SET expires_at = now() - interval '1 minute' WHERE id = $1`, [endpoint.id]);
    expect((await capture(endpoint.slug, "POST", { body: "x" })).status).toBe(410);

    const other = await createEndpoint();
    expect((await routes.deleteEndpoint(other.endpoint.id, other.token)).status).toBe(200);
    expect((await capture(other.endpoint.slug, "GET")).status).toBe(404);
    void token;
  });

  it("rate-limits per IP and per endpoint with 429 + Retry-After", async () => {
    limits.capturePerIpPerMinute = 3;
    const { endpoint } = await createEndpoint();
    const ip = "203.0.113.7";
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await capture(endpoint.slug, "POST", { ip, body: "x" })).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    const blocked = await capture(endpoint.slug, "POST", { ip, body: "x" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    limits.capturePerIpPerMinute = saved.capturePerIpPerMinute;
    PLANS.free.capturePerEndpointPerMinute = 2;
    const e2 = await createEndpoint();
    const s2 = [];
    for (let i = 0; i < 3; i++) s2.push((await capture(e2.endpoint.slug, "GET")).status); // fresh IP each time
    expect(s2).toEqual([200, 200, 429]);
  });

  it("keeps only the newest max_requests (oldest pruned) while counting all", async () => {
    const { endpoint, token } = await createEndpoint();
    const { executor } = await getDb();
    await executor.query(`UPDATE endpoints SET max_requests = 3 WHERE id = $1`, [endpoint.id]);
    for (let i = 1; i <= 5; i++) await capture(endpoint.slug, "POST", { path: `/n${i}`, body: String(i) });
    const { requests } = await list(endpoint.id, token);
    expect(requests.map((r) => r.path)).toEqual(["/n5", "/n4", "/n3"]);
    const ep = (await (await routes.getEndpoint(endpoint.id, token)).json()) as { endpoint: { requestCount: number; storedCount: number } };
    expect(ep.endpoint.requestCount).toBe(5);
    expect(ep.endpoint.storedCount).toBe(3);
  });

  it("serves the custom response, but only as text/plain or JSON with safety headers", async () => {
    const { endpoint, token } = await createEndpoint();
    const ok = await routes.patchEndpoint(endpoint.id, token, {
      response: { status: 202, contentType: "text/plain", body: "<script>alert(1)</script>" },
    });
    expect(ok.status).toBe(200);
    const res = await capture(endpoint.slug, "POST", { body: "x" });
    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toMatch(/^sandbox/);
    expect(await res.text()).toBe("<script>alert(1)</script>");

    for (const contentType of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/html; charset=utf-8"]) {
      const bad = await routes.patchEndpoint(endpoint.id, token, { response: { status: 200, contentType, body: "<b>x</b>" } });
      expect(bad.status, contentType).toBe(400);
    }
    const badJson = await routes.patchEndpoint(endpoint.id, token, { response: { status: 200, contentType: "application/json", body: "{nope" } });
    expect(badJson.status).toBe(400);
    const tooBig = await routes.patchEndpoint(endpoint.id, token, { response: { status: 200, contentType: "text/plain", body: "x".repeat(4097) } });
    expect(tooBig.status).toBe(400);

    // A 204 has no body; reset to default afterwards.
    expect((await routes.patchEndpoint(endpoint.id, token, { response: { status: 204, contentType: "text/plain", body: "" } })).status).toBe(200);
    const r204 = await capture(endpoint.slug, "POST", { body: "x" });
    expect(r204.status).toBe(204);
    expect((await routes.patchEndpoint(endpoint.id, token, { response: null })).status).toBe(200);
    const def = await capture(endpoint.slug, "POST", { body: "x" });
    expect(((await def.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("never stores the owner cookie in captured headers", async () => {
    const { endpoint, token } = await createEndpoint();
    const res = await capture(endpoint.slug, "GET", { headers: { cookie: `hp_owner=${token}; other=1` } });
    const id = ((await res.json()) as { id: string }).id;
    const d = await detail(endpoint.id, id, token);
    expect(d.headers).toContainEqual(["cookie", "other=1"]);
    expect(JSON.stringify(d.headers)).not.toContain(token);
  });
});
