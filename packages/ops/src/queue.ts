/**
 * Clock-injectable job queue operations on CORE's `jobs` table. Same semantics as @repo/database's
 * claimJobs/completeJob/failJob (SKIP LOCKED claim, stale-lock reclaim, 30s * 2^(n-1) backoff capped at
 * 1 h, status 'failed' = dead letter), but every timestamp comes from the caller so tests can drive
 * time and so a worker never mixes DB time with app time.
 */
import type { JobRow } from "@repo/database";
import type { SqlExecutor } from "./types";

export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

/** Claims the oldest due job across all queues (or the given queues). */
export async function claimNextJob(
  ex: SqlExecutor,
  workerId: string,
  now: Date,
  opts: { queues?: string[]; staleAfterMs?: number } = {},
): Promise<JobRow | null> {
  const staleBefore = new Date(now.getTime() - (opts.staleAfterMs ?? 10 * 60_000)).toISOString();
  const { rows } = await ex.query<JobRow>(
    `UPDATE jobs SET status = 'running', locked_at = $2, locked_by = $1, attempts = attempts + 1
     WHERE id = (
       SELECT id FROM jobs
       WHERE run_at <= $2
         AND ($4::text[] IS NULL OR queue = ANY($4::text[]))
         AND (status = 'queued' OR (status = 'running' AND locked_at < $3))
       ORDER BY run_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, queue, payload, attempts::int AS attempts, max_attempts::int AS max_attempts`,
    [workerId, now.toISOString(), staleBefore, opts.queues ?? null],
  );
  return rows[0] ?? null;
}

export async function completeJobAt(ex: SqlExecutor, id: string, now: Date): Promise<void> {
  await ex.query(
    `UPDATE jobs SET status = 'done', finished_at = $2, locked_at = NULL, locked_by = NULL WHERE id = $1`,
    [id, now.toISOString()],
  );
}

/** Retries with backoff, or dead-letters (status 'failed') when exhausted or `permanent`. */
export async function failJobAt(
  ex: SqlExecutor,
  job: Pick<JobRow, "id" | "attempts" | "max_attempts">,
  error: string,
  now: Date,
  opts: { permanent?: boolean } = {},
): Promise<"retry" | "failed"> {
  const dead = opts.permanent === true || job.attempts >= job.max_attempts;
  const runAt = new Date(now.getTime() + backoffMs(job.attempts)).toISOString();
  await ex.query(
    `UPDATE jobs SET status = $2, last_error = $3, locked_at = NULL, locked_by = NULL,
       run_at = CASE WHEN $2 = 'queued' THEN $4::timestamptz ELSE run_at END,
       finished_at = CASE WHEN $2 = 'failed' THEN $5::timestamptz ELSE NULL END
     WHERE id = $1`,
    [job.id, dead ? "failed" : "queued", error.slice(0, 2000), runAt, now.toISOString()],
  );
  return dead ? "failed" : "retry";
}

export async function countDeadLetters(ex: SqlExecutor, since: Date, queue?: string): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM jobs
     WHERE status = 'failed' AND finished_at >= $1 AND ($2::text IS NULL OR queue = $2)`,
    [since.toISOString(), queue ?? null],
  );
  return Number(rows[0]?.n ?? 0);
}
