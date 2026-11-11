import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, CORE_MIGRATIONS, enqueueJob, claimJobs, completeJob, failJob, rateLimit } from "./index";
import * as schema from "./schema";

const handle = createDb("pglite:memory", schema);

beforeAll(async () => {
  await handle.migrate(CORE_MIGRATIONS);
});
afterAll(async () => {
  await handle.close();
});

describe("migrations", () => {
  it("are idempotent", async () => {
    expect(await handle.migrate(CORE_MIGRATIONS)).toEqual([]);
  });

  it("rejects duplicate ids", async () => {
    await expect(handle.migrate([...CORE_MIGRATIONS, ...CORE_MIGRATIONS])).rejects.toThrow(/Duplicate/);
  });

  it("supports drizzle queries on the core schema", async () => {
    const [u] = await handle.db.insert(schema.users).values({ email: "a@example.com" }).returning();
    expect(u?.email).toBe("a@example.com");
    expect(u?.role).toBe("customer");
  });
});

describe("job queue", () => {
  it("claims a due job once, completes it", async () => {
    const id = await enqueueJob(handle.executor, "q1", { n: 1 });
    const first = await claimJobs(handle.executor, "q1", "w1");
    const second = await claimJobs(handle.executor, "q1", "w2");
    expect(first.map((j) => j.id)).toEqual([id]);
    expect(second).toEqual([]);
    await completeJob(handle.executor, id);
    const { rows } = await handle.executor.query<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
    expect(rows[0]?.status).toBe("done");
  });

  it("does not claim future jobs", async () => {
    await enqueueJob(handle.executor, "q2", {}, { runAt: new Date(Date.now() + 60_000) });
    expect(await claimJobs(handle.executor, "q2", "w1")).toEqual([]);
  });

  it("retries with backoff then fails after max attempts", async () => {
    const id = await enqueueJob(handle.executor, "q3", {}, { maxAttempts: 2 });
    const [j1] = await claimJobs(handle.executor, "q3", "w1");
    expect(await failJob(handle.executor, j1!, "boom")).toBe("retry");
    // backoff pushes run_at into the future, so nothing is claimable right now
    expect(await claimJobs(handle.executor, "q3", "w1")).toEqual([]);
    await handle.executor.query(`UPDATE jobs SET run_at = now() WHERE id = $1`, [id]);
    const [j2] = await claimJobs(handle.executor, "q3", "w1");
    expect(j2?.attempts).toBe(2);
    expect(await failJob(handle.executor, j2!, "boom again")).toBe("failed");
  });

  it("reclaims jobs whose worker died", async () => {
    const id = await enqueueJob(handle.executor, "q4", {});
    await claimJobs(handle.executor, "q4", "dead-worker");
    await handle.executor.query(`UPDATE jobs SET locked_at = now() - interval '1 hour' WHERE id = $1`, [id]);
    const [again] = await claimJobs(handle.executor, "q4", "w2");
    expect(again?.id).toBe(id);
  });
});

describe("rate limit", () => {
  it("allows up to the limit in a window, then blocks, then resets", async () => {
    const t = new Date("2026-01-01T00:00:10Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(handle.executor, "ip:1", 3, 60_000, t));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    const next = await rateLimit(handle.executor, "ip:1", 3, 60_000, new Date("2026-01-01T00:01:10Z"));
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(2);
  });
});
