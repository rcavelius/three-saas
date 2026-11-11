import { beforeAll, describe, expect, it } from "vitest";
import * as cronRoute from "@/app/api/cron/tick/route";
import { cleanupExpired, runRetention } from "@/lib/cleanup";
import { getDb } from "@/lib/db";
import { getPlatform } from "@/lib/platform";
import { capture, createEndpoint } from "./helpers";

beforeAll(async () => {
  await getDb();
});

const cron = (auth?: string) =>
  cronRoute.POST(new Request("http://localhost:3003/api/cron/tick", { method: "POST", headers: auth ? { authorization: auth } : {} }));

describe("expiry cleanup", () => {
  it("hard-deletes only expired / deleted endpoints and their requests, in batches", async () => {
    const { executor } = await getDb();
    await executor.query(`DELETE FROM endpoints`);
    const live = await createEndpoint();
    await capture(live.endpoint.slug, "POST", { body: "keep" });
    const expired = [];
    for (let i = 0; i < 5; i++) {
      const e = await createEndpoint();
      await capture(e.endpoint.slug, "POST", { body: "drop" });
      expired.push(e.endpoint.id);
    }
    await executor.query(`UPDATE endpoints SET expires_at = now() - interval '1 hour' WHERE id = ANY($1::uuid[])`, [expired]);
    // A never-expiring (paid) endpoint is untouched.
    const forever = await createEndpoint();
    await executor.query(`UPDATE endpoints SET expires_at = NULL WHERE id = $1`, [forever.endpoint.id]);

    const result = await cleanupExpired(executor, { batchSize: 2 });
    expect(result.endpointsDeleted).toBe(5);
    expect(result.batches).toBe(3);

    const left = await executor.query<{ id: string }>(`SELECT id FROM endpoints ORDER BY created_at`);
    expect(left.rows.map((r) => r.id)).toEqual([live.endpoint.id, forever.endpoint.id]);
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

describe("retention by plan history", () => {
  it("deletes anonymous (free) requests older than the free plan's history, in batches", async () => {
    const p = await getPlatform();
    const e = await createEndpoint();
    for (let i = 0; i < 5; i++) await capture(e.endpoint.slug, "POST", { body: String(i) });
    await p.ex.query(
      `UPDATE captured_requests SET received_at = now() - interval '2 days'
       WHERE id IN (SELECT id FROM captured_requests WHERE endpoint_id = $1 ORDER BY seq LIMIT 3)`,
      [e.endpoint.id],
    );
    const r = await runRetention(p, { batchSize: 2 });
    expect(r.requestsDeleted).toBe(3);
    const { rows } = await p.ex.query(`SELECT 1 FROM captured_requests WHERE endpoint_id = $1`, [e.endpoint.id]);
    expect(rows).toHaveLength(2);
  });

  it("raises a usage incident when stored rows cross the ceiling, and resolves it below", async () => {
    const p = await getPlatform();
    const saved = p.storedRowsCeiling;
    try {
      const e = await createEndpoint();
      for (let i = 0; i < 3; i++) await capture(e.endpoint.slug, "POST", { body: "x" });
      const { rows: c } = await p.ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM captured_requests`);
      p.storedRowsCeiling = Math.max(1, Number(c[0]!.n) - 1);
      expect((await runRetention(p)).ceilingLevel).toBe("critical");
      const open = await p.ex.query<{ severity: string }>(`SELECT severity FROM incidents WHERE fingerprint = 'usage:captured_requests' AND status = 'open'`);
      expect(open.rows[0]?.severity).toBe("critical");
      p.storedRowsCeiling = 1_000_000;
      expect((await runRetention(p)).ceilingLevel).toBe("ok");
      const still = await p.ex.query(`SELECT 1 FROM incidents WHERE fingerprint = 'usage:captured_requests' AND status = 'open'`);
      expect(still.rows).toHaveLength(0);
    } finally {
      p.storedRowsCeiling = saved;
    }
  });

  it("runs from the scheduler (scheduler.tick enqueues and runs hookpilot.retention)", async () => {
    const p = await getPlatform();
    const report = await p.scheduler.tick({ budgetMs: 20_000 });
    expect(report.enqueued.map((e) => e.queue)).toContain("hookpilot.retention");
    expect(report.errors).toEqual([]);
    expect(report.deadLettered).toEqual([]);
    const { rows } = await p.ex.query<{ last_status: string }>(`SELECT last_status FROM ops_schedules WHERE name = 'hookpilot.retention'`);
    expect(rows[0]?.last_status).toBe("ok");
  });
});

describe("cron tick route", () => {
  it("rejects missing, wrong and non-bearer secrets", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong-secret-wrong-secret")).status).toBe(401);
    expect((await cron("Bearer test-cron-secret-0123456789abcde")).status).toBe(401); // one char short
    expect((await cron("test-cron-secret-0123456789abcdef")).status).toBe(401);
  });

  it("runs with the right secret", async () => {
    const res = await cron("Bearer test-cron-secret-0123456789abcdef");
    expect(res.status).toBe(200);
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
