import type { SqlExecutor } from "@repo/database";

export interface CleanupResult {
  endpointsDeleted: number;
  batches: number;
  rateLimitRowsDeleted: number;
}

/**
 * Hard-deletes expired and soft-deleted endpoints (captured requests go with them via ON DELETE
 * CASCADE) in batches, so one run never holds a huge transaction. Also drops stale HookPilot
 * rate-limit counters.
 */
export async function cleanupExpired(
  ex: SqlExecutor,
  opts: { now?: Date; batchSize?: number; maxBatches?: number } = {},
): Promise<CleanupResult> {
  const now = (opts.now ?? new Date()).toISOString();
  const batchSize = opts.batchSize ?? 200;
  const maxBatches = opts.maxBatches ?? 50;
  let endpointsDeleted = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const { rows } = await ex.query<{ n: number }>(
      `WITH doomed AS (
         SELECT id FROM endpoints WHERE expires_at <= $1 OR deleted_at IS NOT NULL ORDER BY expires_at LIMIT $2
       ), d AS (DELETE FROM endpoints WHERE id IN (SELECT id FROM doomed) RETURNING 1)
       SELECT count(*)::int AS n FROM d`,
      [now, batchSize],
    );
    const n = Number(rows[0]?.n ?? 0);
    batches++;
    endpointsDeleted += n;
    if (n < batchSize) break;
  }
  const { rows: rl } = await ex.query<{ n: number }>(
    `WITH d AS (DELETE FROM rate_limits WHERE key LIKE 'hp:%' AND window_start < ($1::timestamptz - interval '1 day') RETURNING 1)
     SELECT count(*)::int AS n FROM d`,
    [now],
  );
  return { endpointsDeleted, batches, rateLimitRowsDeleted: Number(rl[0]?.n ?? 0) };
}
