/**
 * Postgres job queue helpers: enqueue, claim (SKIP LOCKED), complete, fail with exponential backoff.
 * Uses raw SQL through SqlExecutor so it works identically on pg and PGlite.
 */
import type { SqlExecutor } from "./migrations";

export interface JobRow {
  id: string;
  queue: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function enqueueJob(
  ex: SqlExecutor,
  queue: string,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; maxAttempts?: number } = {},
): Promise<string> {
  const { rows } = await ex.query<{ id: string }>(
    `INSERT INTO jobs (queue, payload, run_at, max_attempts) VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
    [queue, JSON.stringify(payload), (opts.runAt ?? new Date()).toISOString(), opts.maxAttempts ?? 5],
  );
  return rows[0]!.id;
}

/** Claims up to `limit` due jobs. Also reclaims jobs whose lock is older than `staleAfterMs` (crashed worker). */
export async function claimJobs(
  ex: SqlExecutor,
  queue: string,
  workerId: string,
  limit = 1,
  staleAfterMs = 10 * 60_000,
): Promise<JobRow[]> {
  const { rows } = await ex.query<JobRow>(
    `UPDATE jobs SET status = 'running', locked_at = now(), locked_by = $2, attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs
       WHERE queue = $1 AND run_at <= now()
         AND (status = 'queued' OR (status = 'running' AND locked_at < now() - ($4 || ' milliseconds')::interval))
       ORDER BY run_at
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, queue, payload, attempts, max_attempts`,
    [queue, workerId, limit, String(staleAfterMs)],
  );
  return rows;
}

export async function completeJob(ex: SqlExecutor, id: string): Promise<void> {
  await ex.query(
    `UPDATE jobs SET status = 'done', finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $1`,
    [id],
  );
}

/** Backoff: 30s * 2^(attempts-1), capped at 1h. Marks 'failed' once attempts are exhausted. */
export async function failJob(ex: SqlExecutor, job: JobRow, error: string): Promise<"retry" | "failed"> {
  const exhausted = job.attempts >= job.max_attempts;
  const delayMs = Math.min(30_000 * 2 ** Math.max(0, job.attempts - 1), 3_600_000);
  await ex.query(
    `UPDATE jobs SET status = $2, last_error = $3, locked_at = NULL, locked_by = NULL,
       run_at = CASE WHEN $2 = 'queued' THEN now() + ($4 || ' milliseconds')::interval ELSE run_at END,
       finished_at = CASE WHEN $2 = 'failed' THEN now() ELSE NULL END
     WHERE id = $1`,
    [job.id, exhausted ? "failed" : "queued", error.slice(0, 2000), String(delayMs)],
  );
  return exhausted ? "failed" : "retry";
}
