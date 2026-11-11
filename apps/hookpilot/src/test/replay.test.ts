/**
 * Replay security. Real deliveries go ONLY to a local node:http fixture on 127.0.0.1, reachable
 * because these tests install @repo/security/testing's loopback policy; adversarial cases switch
 * back to the production public-only policy, where nothing is ever connected to.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FakeStripe } from "@repo/billing/testing";
import { createLoopbackTestPolicy, staticResolver } from "@repo/security/testing";
import * as destinationsRoute from "@/app/api/destinations/route";
import * as destinationRoute from "@/app/api/destinations/[id]/route";
import * as verifyRoute from "@/app/api/destinations/[id]/verify/route";
import * as replayRoute from "@/app/api/endpoints/[id]/requests/[requestId]/replay/route";
import { checkDestinationUrl, isSelfHost } from "@/lib/destinations";
import { limits } from "@/lib/plans";
import type { Platform } from "@/lib/platform";
import type { DestinationDTO, ReplayDTO } from "@/lib/types";
import { apiRequest, capture, createEndpoint, signUpVerified, uniqueEmail, type Jar, type TestUser } from "./helpers";
import { setupPlatform, subscribe } from "./platform";

interface Hit {
  path: string;
  method: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let p: Platform;
let fake: FakeStripe;
let server: Server;
let base: string;
const hits: Hit[] = [];
const loopback = createLoopbackTestPolicy();

beforeAll(async () => {
  ({ p, fake } = await setupPlatform({ replayPolicy: loopback }));
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const path = req.url ?? "/";
      hits.push({ path, method: req.method ?? "", headers: req.headers, body });
      const challenge = (() => {
        try {
          return (JSON.parse(body) as { challenge?: string }).challenge ?? "";
        } catch {
          return "";
        }
      })();
      if (path === "/verify-json") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ challenge }));
      if (path === "/verify-bare") return res.writeHead(200, { "content-type": "text/plain" }).end(challenge);
      if (path === "/verify-wrong") return res.writeHead(200).end("hello");
      if (path === "/redirect") return res.writeHead(302, { location: `${base}/redirect-target` }).end();
      if (path === "/fail") return res.writeHead(500).end("boom");
      // Every other path (/hook...) accepts deliveries and also echoes a challenge, so it can be verified.
      res.writeHead(200, { "content-type": "application/json", "set-cookie": "tracker=1" }).end(JSON.stringify({ ok: true, challenge }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

const savedLimits = { ...limits };
afterEach(() => {
  Object.assign(limits, savedLimits);
  p.replay.policy = loopback;
  p.replay.resolver = undefined;
});

async function paidUser(prefix: string, plan = "developer"): Promise<TestUser> {
  const u = await signUpVerified(uniqueEmail(prefix));
  await subscribe(fake, u, plan);
  return u;
}

async function addDestination(jar: Jar, url: string, name = "dest") {
  const res = await destinationsRoute.POST(apiRequest("POST", "/api/destinations", { jar, body: { name, url } }));
  return { res, dest: res.status === 201 ? ((await res.clone().json()) as { destination: DestinationDTO }).destination : null };
}

async function verify(jar: Jar, id: string) {
  const res = await verifyRoute.POST(apiRequest("POST", `/api/destinations/${id}/verify`, { jar }), { params: Promise.resolve({ id }) });
  return { status: res.status, body: (await res.json()) as { verified: boolean; error: string | null } };
}

async function verifiedDestination(u: TestUser, path = "/hook") {
  const { dest } = await addDestination(u.jar, `${base}${path}`);
  const v = await verify(u.jar, dest!.id);
  expect(v.body.verified).toBe(true);
  return dest!;
}

async function capturedRequest(u: TestUser, init: Parameters<typeof capture>[2] = {}) {
  const e = await createEndpoint(undefined, undefined, u.jar);
  const res = await capture(e.endpoint.slug, init.body === undefined ? "GET" : "POST", init);
  const rid = ((await res.json()) as { id: string }).id;
  return { endpoint: e.endpoint, rid };
}

async function replay(jar: Jar, endpointId: string, rid: string, body: unknown) {
  const res = await replayRoute.POST(apiRequest("POST", `/api/endpoints/${endpointId}/requests/${rid}/replay`, { jar, body }), {
    params: Promise.resolve({ id: endpointId, requestId: rid }),
  });
  return { res, status: res.status, json: (await res.json()) as { replays?: ReplayDTO[]; headers?: Record<string, string[]>; error?: { code: string } } };
}

describe("destination URL validation (production public-only policy)", () => {
  it("refuses private, loopback, metadata, IPv6-mapped, encoded-IP, odd-port, credential and special-use URLs", async () => {
    p.replay.policy = undefined; // production default
    const u = await paidUser("validator");
    const bad = [
      "http://10.0.0.1/hook",
      "http://192.168.1.10/hook",
      "http://169.254.169.254/latest/meta-data/",
      "http://[fd00:ec2::254]/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://127.0.0.1/hook",
      "http://localhost/hook",
      "http://[::1]/hook",
      "http://[::ffff:127.0.0.1]/hook",
      "http://[::ffff:a9fe:a9fe]/hook",
      "http://2130706433/hook",
      "http://0x7f000001/hook",
      "http://0177.0.0.1/hook",
      "http://127.1/hook",
      "http://%31%32%37.0.0.1/hook",
      "https://hooks.example.com:8443/hook",
      "https://user:pass@hooks.example.com/hook",
      "ftp://hooks.example.com/hook",
      "file:///etc/passwd",
      "http://0.0.0.0/hook",
      "http://[::]/hook",
    ];
    for (const url of bad) {
      const { res } = await addDestination(u.jar, url);
      expect(res.status, url).toBe(422);
    }
  });

  it("never targets the HookPilot host itself (or its subdomains)", () => {
    expect(isSelfHost("hookpilot.dev", ["hookpilot.dev"])).toBe(true);
    expect(isSelfHost("HOOKPILOT.dev.", ["hookpilot.dev"])).toBe(true);
    expect(isSelfHost("api.hookpilot.dev", ["hookpilot.dev"])).toBe(true);
    expect(isSelfHost("nothookpilot.dev", ["hookpilot.dev"])).toBe(false);
    const fakeP = { replay: { policy: undefined, resolver: undefined, selfHosts: ["hookpilot.dev"] } };
    const r = checkDestinationUrl(fakeP, "https://hookpilot.dev/h/abc");
    expect(r.ok).toBe(false);
    expect(checkDestinationUrl(fakeP, "https://hooks.example.com/x").ok).toBe(true);
  });

  it("is a paid feature: free workspaces cannot add destinations", async () => {
    const u = await signUpVerified(uniqueEmail("freedest"));
    const { res } = await addDestination(u.jar, "https://hooks.example.com/x");
    expect(res.status).toBe(403);
  });
});

describe("destination verification (challenge echo via safeDeliver)", () => {
  it("verifies on a JSON or bare echo; refuses wrong body, non-2xx and redirects (never followed)", async () => {
    const u = await paidUser("verifier");
    for (const path of ["/verify-json", "/verify-bare"]) {
      const { dest } = await addDestination(u.jar, `${base}${path}`);
      expect((await verify(u.jar, dest!.id)).body.verified, path).toBe(true);
      const sent = hits.filter((h) => h.path === path).at(-1)!;
      const payload = JSON.parse(sent.body) as { type: string; challenge: string };
      expect(payload.type).toBe("hookpilot.verify");
      expect(payload.challenge.length).toBeGreaterThanOrEqual(32);
    }
    for (const path of ["/verify-wrong", "/fail", "/redirect"]) {
      const { dest } = await addDestination(u.jar, `${base}${path}`);
      const v = await verify(u.jar, dest!.id);
      expect(v.body.verified, path).toBe(false);
      expect(v.body.error).toBeTruthy();
    }
    expect(hits.some((h) => h.path === "/redirect-target")).toBe(false);
  });

  it("clears verification when the URL changes; replay then needs re-verification", async () => {
    const u = await paidUser("changer");
    const dest = await verifiedDestination(u);
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    const patched = await destinationRoute.PATCH(
      apiRequest("PATCH", `/api/destinations/${dest.id}`, { jar: u.jar, body: { url: `${base}/hook-v2` } }),
      { params: Promise.resolve({ id: dest.id }) },
    );
    expect(((await patched.json()) as { destination: DestinationDTO }).destination.verified).toBe(false);
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id })).status).toBe(409);
    expect((await verify(u.jar, dest.id)).body.verified).toBe(true);
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id })).status).toBe(201);
  });
});

describe("replay", () => {
  it("refuses an unverified destination (409) and any URL field in the replay form (400)", async () => {
    const u = await paidUser("unverified");
    const { dest } = await addDestination(u.jar, `${base}/hook-unverified`);
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest!.id })).status).toBe(409);
    const withUrl = await replay(u.jar, endpoint.id, rid, { destinationId: dest!.id, url: "http://169.254.169.254/" });
    expect(withUrl.status).toBe(400);
    expect(hits.some((h) => h.path === "/hook-unverified" && h.method !== "POST")).toBe(false);
  });

  it("sends method/body, excludes sensitive headers unless ticked, warns on signatures, audits the attempt", async () => {
    const u = await paidUser("sender");
    const dest = await verifiedDestination(u, "/hook-send");
    const { endpoint, rid } = await capturedRequest(u, {
      body: '{"event":"invoice.paid"}',
      headers: {
        "content-type": "application/json",
        authorization: "Bearer sk_live_secret",
        "x-api-key": "key-123",
        "x-shopify-access-token": "shpat_1",
        cookie: "session=abc",
        "stripe-signature": "t=1,v1=abc",
        "x-forwarded-for": "6.6.6.6",
        "x-custom": "kept",
      },
    });
    const before = hits.length;
    const r = await replay(u.jar, endpoint.id, rid, { destinationId: dest.id });
    expect(r.status).toBe(201);
    const hit = hits.slice(before).find((h) => h.path === "/hook-send")!;
    expect(hit.method).toBe("POST");
    expect(hit.body).toBe('{"event":"invoice.paid"}');
    expect(hit.headers["x-custom"]).toBe("kept");
    expect(hit.headers["stripe-signature"]).toBe("t=1,v1=abc");
    expect(hit.headers.authorization).toBeUndefined();
    expect(hit.headers["x-api-key"]).toBeUndefined();
    expect(hit.headers["x-shopify-access-token"]).toBeUndefined();
    expect(hit.headers.cookie).toBeUndefined();
    expect(hit.headers["x-forwarded-for"]).toBeUndefined();
    expect(hit.headers["x-hookpilot-replay-id"]).toBe(r.json.replays![0]!.id);
    expect(r.json.headers!.signatureWarnings).toContain("stripe-signature");
    expect(r.json.headers!.excludedSensitive).toEqual(expect.arrayContaining(["authorization", "x-api-key", "x-shopify-access-token"]));
    const audit = r.json.replays![0]!;
    expect(audit.status).toBe("delivered");
    expect(audit.responseStatus).toBe(200);
    expect(audit.by).toBeTruthy();
    expect(audit.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(audit.destinationUrl).toBe(`${base}/hook-send`);

    // Ticked: Authorization is sent this time; Cookie stays blocked by the delivery denylist.
    const before2 = hits.length;
    const r2 = await replay(u.jar, endpoint.id, rid, { destinationId: dest.id, includeSensitiveHeaders: ["Authorization", "cookie"] });
    expect(r2.status).toBe(201);
    const hit2 = hits.slice(before2).find((h) => h.path === "/hook-send")!;
    expect(hit2.headers.authorization).toBe("Bearer sk_live_secret");
    expect(hit2.headers.cookie).toBeUndefined();
    expect(hit2.headers["x-api-key"]).toBeUndefined();

    // Audit list
    const list = await replayRoute.GET(apiRequest("GET", `/api/endpoints/${endpoint.id}/requests/${rid}/replay`, { jar: u.jar }), {
      params: Promise.resolve({ id: endpoint.id, requestId: rid }),
    });
    const rows = ((await list.json()) as { replays: ReplayDTO[] }).replays;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.includedSensitive).toEqual(["authorization"]);
  });

  it("cannot inject headers: CR/LF in stored header values and in ticked names are refused", async () => {
    const u = await paidUser("inject");
    const dest = await verifiedDestination(u, "/hook-inject");
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    await p.ex.query(`UPDATE captured_requests SET headers = $2::jsonb WHERE id = $1`, [
      rid,
      JSON.stringify([
        ["x-evil", "a\r\nX-Injected: yes"],
        ["x-ok", "fine"],
      ]),
    ]);
    const before = hits.length;
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id })).status).toBe(201);
    const hit = hits.slice(before).find((h) => h.path === "/hook-inject")!;
    expect(hit.headers["x-injected"]).toBeUndefined();
    expect(hit.headers["x-evil"]).toBeUndefined();
    expect(hit.headers["x-ok"]).toBe("fine");
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id, includeSensitiveHeaders: ["a\r\nb"] })).status).toBe(400);
  });

  it("cross-org: another workspace gets 404 for the request and for the destination", async () => {
    const alice = await paidUser("alice-r");
    const bob = await paidUser("bob-r");
    const aDest = await verifiedDestination(alice, "/hook-alice");
    const bDest = await verifiedDestination(bob, "/hook-bob");
    const a = await capturedRequest(alice, { body: "alice-secret" });
    const b = await capturedRequest(bob, { body: "bob" });
    expect((await replay(bob.jar, a.endpoint.id, a.rid, { destinationId: bDest.id })).status).toBe(404);
    expect((await replay(bob.jar, b.endpoint.id, b.rid, { destinationId: aDest.id })).status).toBe(404);
    expect((await replay(bob.jar, b.endpoint.id, a.rid, { destinationId: bDest.id })).status).toBe(404);
    const del = await destinationRoute.DELETE(apiRequest("DELETE", `/api/destinations/${aDest.id}`, { jar: bob.jar }), {
      params: Promise.resolve({ id: aDest.id }),
    });
    expect(del.status).toBe(404);
    expect((await verify(bob.jar, aDest.id)).status).toBe(404);
  });

  it("is refused on the free plan (plan_required)", async () => {
    const free = await signUpVerified(uniqueEmail("freereplay"));
    const { endpoint, rid } = await capturedRequest(free, { body: "x" });
    const r = await replay(free.jar, endpoint.id, rid, { destinationId: "00000000-0000-4000-8000-000000000000" });
    expect(r.status).toBe(403);
    expect(r.json.error!.code).toBe("plan_required");
  });

  it("rate-limits replays per workspace (429 + Retry-After)", async () => {
    limits.replayPerOrgPerMinute = 2;
    const u = await paidUser("limited");
    const dest = await verifiedDestination(u, "/hook-limit");
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id })).status);
    expect(statuses).toEqual([201, 201, 429]);
  });

  it("rate-limits replays per destination", async () => {
    limits.replayPerDestinationPerMinute = 1;
    const u = await paidUser("destlimited");
    const dest = await verifiedDestination(u, "/hook-dlimit");
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id })).status).toBe(201);
    expect((await replay(u.jar, endpoint.id, rid, { destinationId: dest.id })).status).toBe(429);
  });

  it("does not follow a redirect returned at replay time", async () => {
    const u = await paidUser("redir");
    const { dest } = await addDestination(u.jar, `${base}/redirect`);
    await p.ex.query(`UPDATE hp_destinations SET verified_at = now() WHERE id = $1`, [dest!.id]);
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    const before = hits.length;
    const r = await replay(u.jar, endpoint.id, rid, { destinationId: dest!.id });
    expect(r.status).toBe(201);
    expect(r.json.replays![0]!.responseStatus).toBe(302);
    expect(r.json.replays![0]!.status).toBe("failed");
    expect(hits.slice(before).some((h) => h.path === "/redirect-target")).toBe(false);
  });

  it("blocks DNS rebinding: a verified hostname that now resolves to a private/metadata IP is never contacted", async () => {
    p.replay.policy = undefined; // production policy for this test
    const u = await paidUser("rebind");
    const { dest } = await addDestination(u.jar, "https://hooks.rebind-check.com/x");
    expect(dest).not.toBeNull();
    await p.ex.query(`UPDATE hp_destinations SET verified_at = now() WHERE id = $1`, [dest!.id]);
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    for (const answer of [["169.254.169.254"], ["127.0.0.1"], ["93.184.216.34", "10.0.0.7"], ["::ffff:127.0.0.1"]]) {
      p.replay.resolver = staticResolver({ "hooks.rebind-check.com": answer });
      const r = await replay(u.jar, endpoint.id, rid, { destinationId: dest!.id });
      expect(r.status).toBe(201);
      expect(r.json.replays![0]!.status, answer.join(",")).toBe("blocked");
      expect(r.json.replays![0]!.errorCode).toBe("BLOCKED_ADDRESS");
    }
  });

  it("never replays to the HookPilot host, even for a destination verified earlier", async () => {
    const u = await paidUser("selfhost");
    const dest = await verifiedDestination(u, "/hook-self");
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    p.replay.selfHosts.push("127.0.0.1");
    try {
      const r = await replay(u.jar, endpoint.id, rid, { destinationId: dest.id });
      expect(r.status).toBe(422);
      expect(r.json.error!.code).toBe("destination_blocked");
    } finally {
      p.replay.selfHosts.pop();
    }
  });

  it("refuses bodies over the 1 MB replay cap", async () => {
    const u = await paidUser("bigbody", "pro");
    const dest = await verifiedDestination(u, "/hook-big");
    const { endpoint, rid } = await capturedRequest(u, { body: "b".repeat(1024 * 1024 + 10) });
    const r = await replay(u.jar, endpoint.id, rid, { destinationId: dest.id });
    expect(r.status).toBe(413);
  });
});

describe("replay with retries (job queue)", () => {
  async function runDueReplayJobs() {
    await p.ex.query(`UPDATE jobs SET run_at = now() - interval '1 second' WHERE queue = 'hookpilot.replay' AND status = 'queued'`);
    return p.scheduler.tick({ budgetMs: 20_000 });
  }

  it("retries a failing destination with backoff up to N attempts and records each", async () => {
    const u = await paidUser("retrier");
    const { dest } = await addDestination(u.jar, `${base}/fail`);
    await p.ex.query(`UPDATE hp_destinations SET verified_at = now() WHERE id = $1`, [dest!.id]);
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    const r = await replay(u.jar, endpoint.id, rid, { destinationId: dest!.id, attempts: 3 });
    expect(r.status).toBe(201);
    const batch = r.json.replays![0]!.batchId;
    const { rows: sched } = await p.ex.query<{ run_at: Date; created_at: Date }>(
      `SELECT run_at, created_at FROM hp_replays WHERE batch_id = $1 AND attempt = 2`,
      [batch],
    );
    expect(new Date(sched[0]!.run_at).getTime() - Date.now()).toBeGreaterThan(5_000); // backoff, not immediate
    await runDueReplayJobs();
    await runDueReplayJobs();
    await runDueReplayJobs();
    const { rows } = await p.ex.query<{ attempt: number; status: string; response_status: number }>(
      `SELECT attempt, status, response_status FROM hp_replays WHERE batch_id = $1 ORDER BY attempt`,
      [batch],
    );
    expect(rows.map((x) => [x.attempt, x.status, x.response_status])).toEqual([
      [1, "failed", 500],
      [2, "failed", 500],
      [3, "failed", 500],
    ]);
  });

  it("stops once an attempt succeeds, and skips scheduled attempts whose destination lost verification", async () => {
    const u = await paidUser("stopper");
    const dest = await verifiedDestination(u, "/hook-ok");
    const { endpoint, rid } = await capturedRequest(u, { body: "x" });
    const ok = await replay(u.jar, endpoint.id, rid, { destinationId: dest.id, attempts: 5 });
    const { rows } = await p.ex.query(`SELECT 1 FROM hp_replays WHERE batch_id = $1`, [ok.json.replays![0]!.batchId]);
    expect(rows).toHaveLength(1);

    const { dest: failing } = await addDestination(u.jar, `${base}/fail`);
    await p.ex.query(`UPDATE hp_destinations SET verified_at = now() WHERE id = $1`, [failing!.id]);
    const r = await replay(u.jar, endpoint.id, rid, { destinationId: failing!.id, attempts: 2 });
    await p.ex.query(`UPDATE hp_destinations SET verified_at = NULL WHERE id = $1`, [failing!.id]);
    await runDueReplayJobs();
    const { rows: after } = await p.ex.query<{ attempt: number; status: string }>(
      `SELECT attempt, status FROM hp_replays WHERE batch_id = $1 ORDER BY attempt`,
      [r.json.replays![0]!.batchId],
    );
    expect(after.map((x) => x.status)).toEqual(["failed", "skipped"]);
  });
});
