import { withOrgLock } from "@repo/billing";
import type { SqlExecutor } from "@repo/database";
import { ownerLimits, ownerKey, type Owner } from "./pass";
import { FREE_LIMITS, type PlanLimits } from "./plans";
import type { Platform } from "./platform";

/**
 * Server-side plan limits of an org (billing entitlements are the only source of truth), including one-time passes
 * bought by the org or linked to it (lib/pass.ts). `passIds` = the current viewer's verified pass cookie.
 */
export async function orgLimits(p: Pick<Platform, "billing" | "handle">, orgId: string | null, passIds: string[] = []): Promise<PlanLimits> {
  if (!orgId && passIds.length === 0) return FREE_LIMITS;
  return ownerLimits(p, { orgId }, passIds);
}

/** Limits that apply to an endpoint's owner: its org, or its anonymous owner token (free + linked passes). */
export async function endpointOwnerLimits(
  p: Pick<Platform, "billing" | "handle">,
  ep: { org_id: string | null; anon_owner_hash?: string | null },
  passIds: string[] = [],
): Promise<PlanLimits> {
  return ownerLimits(p, ep.org_id ? { orgId: ep.org_id } : { anonHash: ep.anon_owner_hash ?? null }, passIds);
}

/** Deletes every WebhookTrail row of an org (account deletion). Billing records are kept by @repo/billing. */
export async function purgeOrgData(ex: SqlExecutor, orgId: string): Promise<void> {
  await ex.query(`DELETE FROM hp_replays WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM endpoints WHERE org_id = $1`, [orgId]); // captured_requests cascade
  await ex.query(`DELETE FROM hp_destinations WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM hp_usage_alerts WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM billing_usage WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM hp_pass_links WHERE owner_key = $1`, [ownerKey({ orgId })]);
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
  return enforceOwnerLimits(p, { orgId }, now);
}

/**
 * enforcePlanLimits for any owner. Anonymous owners only ever change limits through a pass, so for them this
 * locks the endpoints above the free count once a pass has ended (and unlocks them while one is active).
 */
export async function enforceOwnerLimits(p: Pick<Platform, "billing" | "handle">, owner: Owner, now = new Date()): Promise<EnforceResult> {
  const isOrg = "orgId" in owner;
  const lim = await ownerLimits(p, isOrg ? { orgId: owner.orgId } : { anonHash: owner.anonHash });
  const id = isOrg ? owner.orgId : owner.anonHash;
  const where = isOrg ? `org_id = $1` : `org_id IS NULL AND anon_owner_hash = $1`;
  return p.handle.transaction(async (tx) => {
    await withOrgLock(tx, isOrg ? owner.orgId : `anon:${owner.anonHash}`);
    const { rows } = await tx.query<{ id: string; locked_at: Date | null }>(
      `SELECT id, locked_at FROM endpoints
       WHERE ${where} AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > $2)
       ORDER BY created_at ASC, id ASC`,
      [id, now.toISOString()],
    );
    const cap = lim.endpoints < 0 ? rows.length : lim.endpoints;
    const keep = rows.slice(0, cap);
    const excess = rows.slice(cap);
    const toUnlock = keep.filter((r) => r.locked_at).map((r) => r.id);
    const toLock = excess.filter((r) => !r.locked_at).map((r) => r.id);
    if (toUnlock.length) await tx.query(`UPDATE endpoints SET locked_at = NULL WHERE id = ANY($1::uuid[])`, [toUnlock]);
    if (toLock.length) await tx.query(`UPDATE endpoints SET locked_at = $2 WHERE id = ANY($1::uuid[])`, [toLock, now.toISOString()]);
    if (isOrg && lim.endpointTtlHours === null) {
      await tx.query(
        `UPDATE endpoints SET expires_at = NULL WHERE org_id = $1 AND deleted_at IS NULL AND expires_at > $2`,
        [owner.orgId, now.toISOString()],
      );
    }
    return { active: keep.length, locked: excess.length, unlocked: toUnlock.length };
  });
}
