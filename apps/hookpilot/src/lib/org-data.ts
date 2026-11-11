import { withOrgLock } from "@repo/billing";
import type { SqlExecutor } from "@repo/database";
import { FREE_LIMITS, limitsFromPlan, type PlanLimits } from "./plans";
import type { Platform } from "./platform";

/** Server-side plan limits of an org (billing entitlements are the only source of truth). */
export async function orgLimits(p: Pick<Platform, "billing">, orgId: string | null): Promise<PlanLimits> {
  if (!orgId) return FREE_LIMITS;
  const ent = await p.billing.getEntitlements(orgId);
  return limitsFromPlan(ent.planId, ent.limits, ent.features, ent.planName);
}

/** Deletes every HookPilot row of an org (account deletion). Billing records are kept by @repo/billing. */
export async function purgeOrgData(ex: SqlExecutor, orgId: string): Promise<void> {
  await ex.query(`DELETE FROM hp_replays WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM endpoints WHERE org_id = $1`, [orgId]); // captured_requests cascade
  await ex.query(`DELETE FROM hp_destinations WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM hp_usage_alerts WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM billing_usage WHERE org_id = $1`, [orgId]);
}

export interface EnforceResult {
  active: number;
  locked: number;
  unlocked: number;
}

/**
 * Applies the org's current plan to its endpoints (after a plan change, and hourly):
 * - endpoints beyond the plan's `endpoints` limit are LOCKED (oldest stay active), never deleted;
 *   capture answers 423 for them and the UI says why;
 * - on a higher limit, locked endpoints are unlocked again (oldest first);
 * - on a paid plan, live endpoints stop expiring (paid endpoints don't expire).
 */
export async function enforcePlanLimits(p: Pick<Platform, "billing" | "handle">, orgId: string, now = new Date()): Promise<EnforceResult> {
  const lim = await orgLimits(p, orgId);
  return p.handle.transaction(async (tx) => {
    await withOrgLock(tx, orgId);
    const { rows } = await tx.query<{ id: string; locked_at: Date | null }>(
      `SELECT id, locked_at FROM endpoints
       WHERE org_id = $1 AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > $2)
       ORDER BY created_at ASC, id ASC`,
      [orgId, now.toISOString()],
    );
    const cap = lim.endpoints < 0 ? rows.length : lim.endpoints;
    const keep = rows.slice(0, cap);
    const excess = rows.slice(cap);
    const toUnlock = keep.filter((r) => r.locked_at).map((r) => r.id);
    const toLock = excess.filter((r) => !r.locked_at).map((r) => r.id);
    if (toUnlock.length) await tx.query(`UPDATE endpoints SET locked_at = NULL WHERE id = ANY($1::uuid[])`, [toUnlock]);
    if (toLock.length) await tx.query(`UPDATE endpoints SET locked_at = $2 WHERE id = ANY($1::uuid[])`, [toLock, now.toISOString()]);
    if (lim.endpointTtlHours === null) {
      await tx.query(
        `UPDATE endpoints SET expires_at = NULL WHERE org_id = $1 AND deleted_at IS NULL AND expires_at > $2`,
        [orgId, now.toISOString()],
      );
    }
    return { active: keep.length, locked: excess.length, unlocked: toUnlock.length };
  });
}
