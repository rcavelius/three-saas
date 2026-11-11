import type { SqlExecutor } from "@repo/database";
import { checkUsageCeiling } from "@repo/ops";
import { orgLimits } from "./org-data";
import { FREE_LIMITS } from "./plans";
import type { Platform } from "./platform";

export interface CleanupResult {
  endpointsDeleted: number;
  batches: number;
  rateLimitRowsDeleted: number;
}

/**
 * Hard-deletes expired and soft-deleted endpoints (captured requests go with them via ON DELETE
 * CASCADE) in batches, so one run never holds a huge transaction. Endpoints with expires_at NULL
 * (paid plans) never expire. Also drops stale HookPilot rate-limit counters.
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
         SELECT id FROM endpoints WHERE expires_at <= $1 OR deleted_at IS NOT NULL ORDER BY expires_at NULLS LAST LIMIT $2
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

const DAY = 86_400_000;

/** Deletes requests older than `cutoff` for the endpoints matched by `where` ($1 = cutoff, $2 = batch, $3 = owner). */
async function deleteOlderThan(ex: SqlExecutor, where: string, owner: string | null, cutoff: Date, batchSize: number, maxBatches: number) {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const { rows } = await ex.query<{ n: number }>(
      `WITH doomed AS (
         SELECT r.id FROM captured_requests r JOIN endpoints e ON e.id = r.endpoint_id
         WHERE ${where} AND r.received_at < $1 LIMIT $2
       ), d AS (DELETE FROM captured_requests WHERE id IN (SELECT id FROM doomed) RETURNING 1)
       SELECT count(*)::int AS n FROM d`,
      [cutoff.toISOString(), batchSize, owner],
    );
    const n = Number(rows[0]?.n ?? 0);
    total += n;
    if (n < batchSize) break;
  }
  return total;
}

export interface RetentionResult extends CleanupResult {
  requestsDeleted: number;
  storedRows: number;
  ceilingLevel: string;
}

/**
 * Scheduled retention (job "hookpilot.retention"): expired endpoints, then captured requests older
 * than each owner's plan `historyDays` (anonymous = free plan), in batches; finally a usage ceiling
 * incident (`usage:captured_requests`) on the total number of stored rows.
 */
export async function runRetention(
  p: Pick<Platform, "ex" | "billing" | "storedRowsCeiling">,
  opts: { now?: Date; batchSize?: number; maxBatches?: number } = {},
): Promise<RetentionResult> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 1000;
  const maxBatches = opts.maxBatches ?? 50;
  const base = await cleanupExpired(p.ex, { now, maxBatches });
  let requestsDeleted = await deleteOlderThan(
    p.ex,
    `e.org_id IS NULL AND ($3::text IS NULL OR true)`,
    null,
    new Date(now.getTime() - FREE_LIMITS.historyDays * DAY),
    batchSize,
    maxBatches,
  );
  const { rows: orgs } = await p.ex.query<{ org_id: string }>(
    `SELECT DISTINCT org_id FROM endpoints WHERE org_id IS NOT NULL AND deleted_at IS NULL`,
  );
  for (const { org_id } of orgs) {
    const lim = await orgLimits(p, org_id);
    requestsDeleted += await deleteOlderThan(
      p.ex,
      `e.org_id = $3`,
      org_id,
      new Date(now.getTime() - lim.historyDays * DAY),
      batchSize,
      maxBatches,
    );
  }
  const { rows: c } = await p.ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM captured_requests`);
  const storedRows = Number(c[0]?.n ?? 0);
  const ceiling = await checkUsageCeiling(p.ex, { metric: "captured_requests", value: storedRows, ceiling: p.storedRowsCeiling, now });
  return { ...base, requestsDeleted, storedRows, ceilingLevel: ceiling.level };
}
