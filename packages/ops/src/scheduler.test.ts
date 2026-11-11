import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enqueueJob, type DbHandle } from "@repo/database";
import { createScheduler } from "./scheduler";
import { autoResolve, getOpenIncident, raiseIncident, resolveIncident } from "./incidents";
import { getHeartbeat } from "./state";
import { PermanentJobError, type JobHandler } from "./types";
import { makeClock, makeDb } from "./test/fixtures";

let handle: DbHandle<any>;
const ex = () => handle.executor;

beforeAll(async () => {
  handle = await makeDb();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await ex().exec(`DELETE FROM jobs; DELETE FROM incidents; DELETE FROM ops_schedules; DELETE FROM ops_heartbeats;`);
});

describe("incidents", () => {
  it("deduplicates open incidents by fingerprint and never lowers severity", async () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const a = await raiseIncident(ex(), { fingerprint: "x", severity: "warning", source: "t", title: "one" }, { now });
    const b = await raiseIncident(ex(), { fingerprint: "x", severity: "info", source: "t", title: "two" }, {
      now: new Date("2026-03-01T01:00:00Z"),
    });
    expect(b.id).toBe(a.id);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.severity).toBe("warning");
    expect(b.occurrences).toBe(2);
    const c = await raiseIncident(ex(), { fingerprint: "x", severity: "critical", source: "t", title: "three" }, { now });
    expect(c.severity).toBe("critical");
    const d = await raiseIncident(ex(), { fingerprint: "x", severity: "warning", source: "t", title: "four" }, { now });
    expect(d.severity).toBe("critical");
    const row = await getOpenIncident(ex(), "x");
    expect(row?.occurrences).toBe(4);
    expect(new Date(row!.last_seen_at).toISOString()).toBe(now.toISOString());
  });

  it("opens a fresh incident after resolution; autoResolve only touches the open one", async () => {
    const first = await raiseIncident(ex(), { fingerprint: "y", severity: "warning", source: "t", title: "a" });
    expect(await resolveIncident(ex(), first.id)).toBe(true);
    expect(await resolveIncident(ex(), first.id)).toBe(false);
    const second = await raiseIncident(ex(), { fingerprint: "y", severity: "warning", source: "t", title: "a" });
    expect(second.id).not.toBe(first.id);
    expect(second.occurrences).toBe(1);
    expect(await autoResolve(ex(), "y")).toBe(true);
    expect(await autoResolve(ex(), "y")).toBe(false);
    expect(await getOpenIncident(ex(), "y")).toBeNull();
  });

  it("redacts secrets in details", async () => {
    await raiseIncident(ex(), {
      fingerprint: "z",
      severity: "info",
      source: "t",
      title: "t",
      details: { apiKey: "re_123", msg: "Bearer abc.def" },
    });
    const row = await getOpenIncident(ex(), "z");
    expect(row?.details).toEqual({ apiKey: "[redacted]", msg: "[redacted]" });
  });
});

describe("scheduler", () => {
  it("concurrent ticks never double-enqueue a schedule", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    const runs: string[] = [];
    const jobs: Record<string, JobHandler> = {
      a: async () => void runs.push("a"),
      b: async () => void runs.push("b"),
    };
    const schedules = [
      { name: "a", intervalSeconds: 60 },
      { name: "b", intervalSeconds: 300 },
    ];
    const s1 = createScheduler({ handle, jobs, schedules, workerId: "w1", now: clock });
    const s2 = createScheduler({ handle, jobs, schedules, workerId: "w2", now: clock });
    const [r1, r2] = await Promise.all([s1.tick(), s2.tick()]);
    expect(r1.enqueued.length + r2.enqueued.length).toBe(2);
    expect(runs.sort()).toEqual(["a", "b"]);
    const { rows } = await ex().query<{ n: number }>(`SELECT count(*)::int AS n FROM jobs`);
    expect(rows[0]!.n).toBe(2);

    // Not due again until the interval passes.
    clock.advance(30_000);
    const r3 = await s1.tick();
    expect(r3.enqueued).toEqual([]);
    clock.advance(31_000);
    const [r4, r5] = await Promise.all([s1.tick(), s2.tick()]);
    expect([...r4.enqueued, ...r5.enqueued].map((e) => e.schedule)).toEqual(["a"]);
    const { rows: sched } = await ex().query<{ name: string; next_run_at: Date; last_status: string }>(
      `SELECT name, next_run_at, last_status FROM ops_schedules ORDER BY name`,
    );
    expect(new Date(sched[0]!.next_run_at).toISOString()).toBe("2026-03-01T00:02:00.000Z");
    expect(sched[0]!.last_status).toBe("ok");
  });

  it("does not stack a schedule while its previous job is still pending", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    const s = createScheduler({
      handle,
      jobs: { slow: async () => {} },
      schedules: [{ name: "slow", intervalSeconds: 60 }],
      now: clock,
    });
    // maxJobs 0: enqueue only, run nothing.
    expect((await s.tick({ maxJobs: 0 })).enqueued).toHaveLength(1);
    clock.advance(61_000);
    const r = await s.tick({ maxJobs: 0 });
    expect(r.enqueued).toEqual([]);
    expect(r.skipped).toEqual(["slow"]);
  });

  it("retries with backoff, dead-letters, raises a warning, escalates to critical on the 3rd", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    let calls = 0;
    const s = createScheduler({
      handle,
      jobs: {
        flaky: async () => {
          calls++;
          throw new Error("upstream down token=sk_live_abc123");
        },
      },
      schedules: [],
      now: clock,
    });
    const id = await enqueueJob(ex(), "flaky", {}, { runAt: clock(), maxAttempts: 2 });
    const r1 = await s.tick();
    expect(r1.retried).toBe(1);
    const { rows } = await ex().query<{ status: string; run_at: Date; last_error: string }>(
      `SELECT status, run_at, last_error FROM jobs WHERE id = $1`,
      [id],
    );
    expect(rows[0]!.status).toBe("queued");
    expect(new Date(rows[0]!.run_at).toISOString()).toBe("2026-03-01T00:00:30.000Z"); // 30s backoff
    expect(rows[0]!.last_error).not.toContain("sk_live_abc123");

    clock.advance(10_000);
    expect((await s.tick()).ran).toBe(0); // still backing off
    clock.advance(25_000);
    const r2 = await s.tick();
    expect(r2.deadLettered.map((d) => d.jobId)).toEqual([id]);
    expect(calls).toBe(2);
    let inc = await getOpenIncident(ex(), "job:flaky");
    expect(inc?.severity).toBe("warning");

    for (let i = 0; i < 2; i++) {
      await enqueueJob(ex(), "flaky", {}, { runAt: clock(), maxAttempts: 1 });
      await s.tick();
    }
    inc = await getOpenIncident(ex(), "job:flaky");
    expect(inc?.severity).toBe("critical");
    expect(inc?.occurrences).toBe(3);
    expect(inc?.details.deadLetters24h).toBe(3);

    const dead = await s.listDeadLetters({ queue: "flaky" });
    expect(dead).toHaveLength(3);
    expect(await s.retryDeadLetter(id)).toBe(true);
    expect(await s.retryDeadLetter(id)).toBe(false); // no longer dead
    expect((await s.listDeadLetters({ queue: "flaky" })).map((d) => d.id)).not.toContain(id);
  });

  it("retryDeadLetter re-runs a job successfully", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    let fail = true;
    const s = createScheduler({
      handle,
      jobs: {
        once: async () => {
          if (fail) throw new PermanentJobError("bad input");
        },
      },
      schedules: [],
      now: clock,
    });
    const id = await enqueueJob(ex(), "once", {}, { runAt: clock(), maxAttempts: 5 });
    const r = await s.tick();
    expect(r.deadLettered).toHaveLength(1); // permanent: no retries
    fail = false;
    expect(await s.retryDeadLetter(id)).toBe(true);
    const r2 = await s.tick();
    expect(r2.succeeded).toBe(1);
    const { rows } = await ex().query<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
    expect(rows[0]!.status).toBe("done");
  });

  it("dead-letters unknown queues immediately with a clear error", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    const s = createScheduler({ handle, jobs: {}, schedules: [], now: clock });
    const id = await enqueueJob(ex(), "nope", {}, { runAt: clock() });
    const r = await s.tick();
    expect(r.deadLettered[0]?.error).toMatch(/No job handler registered for queue "nope"/);
    const { rows } = await ex().query<{ status: string; attempts: number }>(`SELECT status, attempts FROM jobs WHERE id = $1`, [id]);
    expect(rows[0]).toMatchObject({ status: "failed", attempts: 1 });
    expect((await getOpenIncident(ex(), "job:nope"))?.severity).toBe("warning");
  });

  it("stops when the budget is spent and writes the scheduler heartbeat", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    let mono = 0;
    const s = createScheduler({
      handle,
      jobs: { work: async () => void (mono += 400) },
      schedules: [],
      now: clock,
      monotonic: () => mono,
    });
    for (let i = 0; i < 5; i++) await enqueueJob(ex(), "work", { i }, { runAt: clock() });
    const r = await s.tick({ budgetMs: 1000 });
    expect(r.ran).toBe(3);
    expect(r.budgetExhausted).toBe(true);
    const hb = await getHeartbeat(ex(), "scheduler");
    expect(hb?.at.toISOString()).toBe(clock().toISOString());
    expect(hb?.details.ran).toBe(3);
  });

  it("fails a job that exceeds the per-job timeout", async () => {
    const clock = makeClock("2026-03-01T00:00:00Z");
    const s = createScheduler({
      handle,
      jobs: { hang: () => new Promise(() => {}) },
      schedules: [],
      now: clock,
      jobTimeoutMs: 20,
    });
    await enqueueJob(ex(), "hang", {}, { runAt: clock(), maxAttempts: 1 });
    const r = await s.tick();
    expect(r.deadLettered[0]?.error).toMatch(/timed out/);
  });

  it("rejects schedules without a handler", () => {
    expect(() => createScheduler({ handle, jobs: {}, schedules: [{ name: "x", intervalSeconds: 60 }] })).toThrow(/no job handler/);
  });
});
