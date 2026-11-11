import type { SqlExecutor } from "@repo/database";

/** Transaction-scoped advisory lock on an arbitrary string key (released at COMMIT/ROLLBACK). */
export async function advisoryXactLock(tx: SqlExecutor, key: string): Promise<void> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [key]);
}

/**
 * Serialises "count then insert" sequences for one organization, for gauge limits such as the
 * number of monitored sites or endpoints:
 *
 *   await handle.transaction(async (tx) => {
 *     await withOrgLock(tx, orgId);
 *     const { rows } = await tx.query(`SELECT count(*)::int AS n FROM sites WHERE org_id = $1`, [orgId]);
 *     if (rows[0].n >= ent.limits.sites) throw new Error("limit");
 *     await tx.query(`INSERT INTO sites ...`);
 *   });
 *
 * Must be called inside handle.transaction (the lock is released when that transaction ends).
 */
export async function withOrgLock(tx: SqlExecutor, orgId: string): Promise<void> {
  if (!orgId) throw new Error("withOrgLock: orgId required");
  await advisoryXactLock(tx, `org:${orgId}`);
}
