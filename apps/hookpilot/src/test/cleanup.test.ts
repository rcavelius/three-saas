import { beforeAll, describe, expect, it } from "vitest";
import * as cronRoute from "@/app/api/cron/cleanup/route";
import { cleanupExpired } from "@/lib/cleanup";
import { getDb } from "@/lib/db";
import { capture, createEndpoint } from "./helpers";

beforeAll(async () => {
  await getDb();
});

const cron = (auth?: string) =>
  cronRoute.POST(new Request("http://localhost:3003/api/cron/cleanup", { method: "POST", headers: auth ? { authorization: auth } : {} }));

describe("expiry cleanup", () => {
  it("hard-deletes only expired / deleted endpoints and their requests, in batches", async () => {
    const { executor } = await getDb();
    const live = await createEndpoint();
    await capture(live.endpoint.slug, "POST", { body: "keep" });
    const expired = [];
    for (let i = 0; i < 5; i++) {
      const e = await createEndpoint();
      await capture(e.endpoint.slug, "POST", { body: "drop" });
      expired.push(e.endpoint.id);
    }
    await executor.query(`UPDATE endpoints SET expires_at = now() - interval '1 hour' WHERE id = ANY($1::uuid[])`, [expired]);

    const result = await cleanupExpired(executor, { batchSize: 2 });
    expect(result.endpointsDeleted).toBe(5);
    expect(result.batches).toBe(3);

    const left = await executor.query<{ id: string }>(`SELECT id FROM endpoints`);
    expect(left.rows.map((r) => r.id)).toEqual([live.endpoint.id]);
    const reqs = await executor.query<{ endpoint_id: string }>(`SELECT endpoint_id FROM captured_requests`);
    expect(reqs.rows.map((r) => r.endpoint_id)).toEqual([live.endpoint.id]);

    // Soft-deleted endpoints go too.
    await executor.query(`UPDATE endpoints SET deleted_at = now() WHERE id = $1`, [live.endpoint.id]);
    expect((await cleanupExpired(executor)).endpointsDeleted).toBe(1);
    expect((await executor.query(`SELECT 1 FROM captured_requests`)).rows).toHaveLength(0);
  });

  it("drops stale hookpilot rate-limit rows only", async () => {
    const { executor } = await getDb();
    await executor.query(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ('hp:old', now() - interval '3 days', 1), ('other:old', now() - interval '3 days', 1), ('hp:new', now(), 1)`,
    );
    const r = await cleanupExpired(executor);
    expect(r.rateLimitRowsDeleted).toBe(1);
    const keys = (await executor.query<{ key: string }>(`SELECT key FROM rate_limits WHERE key IN ('hp:old','other:old','hp:new') ORDER BY key`)).rows;
    expect(keys.map((k) => k.key)).toEqual(["hp:new", "other:old"]);
  });
});

describe("cron route", () => {
  it("rejects missing, wrong and non-bearer secrets", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong-secret-wrong-secret")).status).toBe(401);
    expect((await cron("Bearer test-cron-secret-0123456789abcde")).status).toBe(401); // one char short
    expect((await cron("test-cron-secret-0123456789abcdef")).status).toBe(401);
  });

  it("runs with the right secret", async () => {
    const res = await cron("Bearer test-cron-secret-0123456789abcdef");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("is disabled when CRON_SECRET is unset", async () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect((await cron("Bearer anything-anything-anything")).status).toBe(503);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });
});
