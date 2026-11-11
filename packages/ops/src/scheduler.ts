/**
 * Cron-driven scheduler + job runner. Hosting cron (or a tiny external pinger) calls
 * POST /api/cron/tick every minute; each tick:
 *  (a) atomically claims due schedules (UPDATE ... RETURNING inside a transaction) and enqueues their job,
 *  (b) runs queued jobs until the time budget is spent,
 *  (c) dead-letters exhausted / permanent / unknown-queue jobs and raises an incident `job:<queue>`
 *      (warning; critical once >= 3 dead letters for that queue in 24 h),
 *  (d) writes heartbeat `scheduler`.
 */
import { enqueueJob, type DbHandle, type JobRow } from "@repo/database";
import { redact, type Logger } from "@repo/monitoring";
import { raiseIncident } from "./incidents";
import { claimNextJob, completeJobAt, countDeadLetters, failJobAt } from "./queue";
import { writeHeartbeat } from "./state";
import { isPermanentJobError, silentLogger, systemClock, type Clock, type JobHandler } from "./types";

export interface ScheduleDef {
  /** Unique schedule name (primary key in ops_schedules). */
  name: string;
  /** Job queue to enqueue; defaults to `name`. */
  queue?: string;
  intervalSeconds: number;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface DeadLetter {
  id: string;
  queue: string;
  attempts: number;
  lastError: string | null;
  finishedAt: Date | null;
  payload: Record<string, unknown>;
}

export interface TickReport {
  startedAt: string;
  durationMs: number;
  enqueued: { schedule: string; queue: string; jobId: string }[];
  /** Due schedules whose previous job was still queued/running (advanced without enqueueing). */
  skipped: string[];
  ran: number;
  succeeded: number;
  retried: number;
  deadLettered: { jobId: string; queue: string; error: string }[];
  budgetExhausted: boolean;
  errors: string[];
}

export interface Scheduler {
  tick(opts?: { budgetMs?: number; maxJobs?: number }): Promise<TickReport>;
  retryDeadLetter(id: string): Promise<boolean>;
  listDeadLetters(opts?: { limit?: number; queue?: string }): Promise<DeadLetter[]>;
}

export interface SchedulerOptions {
  handle: DbHandle<any>;
  jobs: Record<string, JobHandler>;
  schedules: ScheduleDef[];
  logger?: Logger;
  workerId?: string;
  now?: Clock;
  /** Monotonic ms counter for the tick budget (default performance.now). */
  monotonic?: () => number;
  /** Hard cap for one job run (default 55 s); a timed-out run counts as a failed attempt. */
  jobTimeoutMs?: number;
}

const DEAD_LETTER_CRITICAL_THRESHOLD = 3;

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return String(redact(msg)).slice(0, 2000);
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const { handle } = opts;
  const ex = handle.executor;
  const clock = opts.now ?? systemClock;
  const mono = opts.monotonic ?? (() => performance.now());
  const logger = opts.logger ?? silentLogger;
  const workerId = opts.workerId ?? `worker-${Math.random().toString(36).slice(2, 10)}`;
  const jobTimeoutMs = opts.jobTimeoutMs ?? 55_000;
  const byName = new Map<string, ScheduleDef>();
  for (const s of opts.schedules) {
    if (byName.has(s.name)) throw new Error(`Duplicate schedule name: ${s.name}`);
    if (!Number.isInteger(s.intervalSeconds) || s.intervalSeconds < 1) {
      throw new Error(`Schedule ${s.name}: intervalSeconds must be a positive integer`);
    }
    const queue = s.queue ?? s.name;
    if (!opts.jobs[queue]) throw new Error(`Schedule ${s.name}: no job handler for queue "${queue}"`);
    byName.set(s.name, s);
  }

  let synced: Promise<void> | null = null;
  // `at` is the tick's own start time, so a brand-new schedule is due in the very tick that created it.
  const syncSchedules = (at: Date) => {
    synced ??= (async () => {
      const now = at.toISOString();
      for (const s of byName.values()) {
        // New schedules run on the first tick; existing ones keep their next_run_at.
        await ex.query(
          `INSERT INTO ops_schedules (name, interval_seconds, next_run_at) VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET interval_seconds = EXCLUDED.interval_seconds`,
          [s.name, s.intervalSeconds, now],
        );
      }
    })().catch((err) => {
      synced = null;
      throw err;
    });
    return synced;
  };

  async function enqueueDueSchedules(now: Date, report: TickReport): Promise<void> {
    const names = [...byName.keys()];
    if (names.length === 0) return;
    const iso = now.toISOString();
    await handle.transaction(async (tx) => {
      // The row lock taken by UPDATE makes a concurrent tick wait, then re-check next_run_at <= now
      // against the advanced value and skip the row: each due slot is claimed exactly once.
      const { rows } = await tx.query<{ name: string }>(
        `UPDATE ops_schedules SET
           last_run_at = $2,
           next_run_at = CASE
             WHEN next_run_at + make_interval(secs => interval_seconds) > $2::timestamptz
               THEN next_run_at + make_interval(secs => interval_seconds)
             ELSE $2::timestamptz + make_interval(secs => interval_seconds) END
         WHERE name = ANY($1::text[]) AND next_run_at <= $2
         RETURNING name`,
        [names, iso],
      );
      for (const { name } of rows) {
        const s = byName.get(name)!;
        const queue = s.queue ?? s.name;
        const pending = await tx.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM jobs
           WHERE queue = $1 AND status IN ('queued', 'running') AND payload->>'_schedule' = $2`,
          [queue, name],
        );
        if (Number(pending.rows[0]?.n ?? 0) > 0) {
          report.skipped.push(name);
          continue;
        }
        const jobId = await enqueueJob(tx, queue, { ...(s.payload ?? {}), _schedule: name }, {
          runAt: now,
          maxAttempts: s.maxAttempts,
        });
        report.enqueued.push({ schedule: name, queue, jobId });
      }
    });
  }

  async function onDeadLetter(job: JobRow, error: string, now: Date, report: TickReport): Promise<void> {
    report.deadLettered.push({ jobId: job.id, queue: job.queue, error });
    const since = new Date(now.getTime() - 24 * 3600_000);
    const count = await countDeadLetters(ex, since, job.queue);
    await raiseIncident(
      ex,
      {
        fingerprint: `job:${job.queue}`,
        severity: count >= DEAD_LETTER_CRITICAL_THRESHOLD ? "critical" : "warning",
        source: "scheduler",
        title: `Background job "${job.queue}" failed permanently`,
        details: { deadLetters24h: count, lastJobId: job.id, lastError: error.slice(0, 500) },
      },
      { now },
    );
    logger.error("job dead-lettered", { queue: job.queue, jobId: job.id, deadLetters24h: count });
  }

  async function recordScheduleOutcome(job: JobRow, status: "ok" | "error", error: string | null) {
    const name = typeof job.payload?._schedule === "string" ? job.payload._schedule : null;
    if (!name) return;
    await ex.query(`UPDATE ops_schedules SET last_status = $2, last_error = $3 WHERE name = $1`, [
      name,
      status,
      error ? error.slice(0, 1000) : null,
    ]);
  }

  async function runJob(job: JobRow, report: TickReport): Promise<void> {
    report.ran++;
    const handler = opts.jobs[job.queue];
    if (!handler) {
      const error = `No job handler registered for queue "${job.queue}"`;
      const now = clock();
      await failJobAt(ex, job, error, now, { permanent: true });
      await recordScheduleOutcome(job, "error", error);
      await onDeadLetter(job, error, now, report);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { _schedule, ...payload } = job.payload ?? {};
      void _schedule;
      await Promise.race([
        handler(payload, {
          jobId: job.id,
          queue: job.queue,
          attempt: job.attempts,
          maxAttempts: job.max_attempts,
          isFinalAttempt: job.attempts >= job.max_attempts,
          now: clock(),
          logger: logger.child({ queue: job.queue, jobId: job.id }),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Job timed out after ${jobTimeoutMs} ms`)), jobTimeoutMs);
        }),
      ]);
      clearTimeout(timer);
      await completeJobAt(ex, job.id, clock());
      await recordScheduleOutcome(job, "ok", null);
      report.succeeded++;
    } catch (err) {
      clearTimeout(timer);
      const error = errorMessage(err);
      const now = clock();
      const outcome = await failJobAt(ex, job, error, now, { permanent: isPermanentJobError(err) });
      await recordScheduleOutcome(job, "error", error);
      if (outcome === "retry") {
        report.retried++;
        logger.warn("job failed, will retry", { queue: job.queue, jobId: job.id, attempt: job.attempts });
      } else {
        await onDeadLetter(job, error, now, report);
      }
    }
  }

  return {
    async tick({ budgetMs = 50_000, maxJobs = 100 } = {}) {
      const start = mono();
      const startedAt = clock();
      const report: TickReport = {
        startedAt: startedAt.toISOString(),
        durationMs: 0,
        enqueued: [],
        skipped: [],
        ran: 0,
        succeeded: 0,
        retried: 0,
        deadLettered: [],
        budgetExhausted: false,
        errors: [],
      };
      try {
        await syncSchedules(startedAt);
        await enqueueDueSchedules(startedAt, report);
      } catch (err) {
        report.errors.push(`schedules: ${errorMessage(err)}`);
        logger.error("scheduler: enqueueing schedules failed", { error: errorMessage(err) });
      }
      while (report.ran < maxJobs) {
        if (mono() - start >= budgetMs) {
          report.budgetExhausted = true;
          break;
        }
        let job: JobRow | null;
        try {
          job = await claimNextJob(ex, workerId, clock());
        } catch (err) {
          report.errors.push(`claim: ${errorMessage(err)}`);
          break;
        }
        if (!job) break;
        try {
          await runJob(job, report);
        } catch (err) {
          // Bookkeeping failure (DB down mid-tick). Stale-lock reclaim picks the job up later.
          report.errors.push(`job ${job.id}: ${errorMessage(err)}`);
          break;
        }
      }
      report.durationMs = Math.round(mono() - start);
      try {
        await writeHeartbeat(
          ex,
          "scheduler",
          {
            workerId,
            ran: report.ran,
            succeeded: report.succeeded,
            retried: report.retried,
            deadLettered: report.deadLettered.length,
            errors: report.errors.length,
          },
          clock(),
        );
      } catch (err) {
        report.errors.push(`heartbeat: ${errorMessage(err)}`);
      }
      return report;
    },

    async retryDeadLetter(id) {
      const { rows } = await ex.query<{ id: string }>(
        `UPDATE jobs SET status = 'queued', attempts = 0, run_at = $2, finished_at = NULL,
           locked_at = NULL, locked_by = NULL
         WHERE id = $1 AND status = 'failed' RETURNING id`,
        [id, clock().toISOString()],
      );
      return rows.length > 0;
    },

    async listDeadLetters({ limit = 50, queue } = {}) {
      const { rows } = await ex.query<{
        id: string;
        queue: string;
        attempts: number;
        last_error: string | null;
        finished_at: Date | null;
        payload: Record<string, unknown>;
      }>(
        `SELECT id, queue, attempts::int AS attempts, last_error, finished_at, payload FROM jobs
         WHERE status = 'failed' AND ($2::text IS NULL OR queue = $2)
         ORDER BY finished_at DESC NULLS LAST LIMIT $1`,
        [Math.min(Math.max(1, limit), 500), queue ?? null],
      );
      return rows.map((r) => ({
        id: r.id,
        queue: r.queue,
        attempts: Number(r.attempts),
        lastError: r.last_error,
        finishedAt: r.finished_at ? new Date(r.finished_at) : null,
        payload: r.payload,
      }));
    },
  };
}
