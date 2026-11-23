/**
 * The one-time "7-day pass" (catalog pass "week" in @repo/billing): replay plus the Developer capture limits for
 * 7 days, paid once, no account needed.
 *
 * Where a pass applies:
 * - viewer actions (inspect, create, replay): the verified pass cookie of the request (Viewer.passIds), plus any
 *   pass bought while signed in (billing counts those for the org automatically);
 * - capture, retention, replay retries and the hourly limit job have no cookie, so a pass seen on a viewer's
 *   request is LINKED to that viewer's owners (workspace and/or anonymous owner token) in hp_pass_links. Every
 *   server-side limit lookup (ownerLimits) adds the linked passes, and billing still decides whether each one is
 *   active (paid, not expired, not refunded). When the pass ends, limits fall back to the plan exactly like a
 *   downgrade: the hourly job locks endpoints above the plan's count, retention trims history, capture prunes
 *   to the plan's stored-request limit.
 */
import { createHash } from "node:crypto";
import { applyPassGrants, getPass, withOrgLock, type ActivePass, type PassDef } from "@repo/billing";
import type { SqlExecutor } from "@repo/database";
import { CATALOG, FREE_PLAN, formatCount, limitsFromPlan, priceLabel, type PlanLimits } from "./plans";
import { enforceOwnerLimits } from "./org-data";
import type { Platform } from "./platform";
import type { PassOffer } from "./types";

export const PASS_COOKIE = "wt_pass";
export const WEEK_PASS_ID = "week";
/** A pass (and its unlock link) can be linked to at most this many owners (browsers / workspaces). */
export const MAX_OWNERS_PER_PASS = 5;
/** Links are kept this long after the pass ended, so the hourly job can apply the downgrade to anonymous owners. */
export const LINK_GRACE_DAYS = 8;

/** Server-only secret of the pass cookie, derived from the auth secret (never sent anywhere). */
export function passCookieSecret(sessionSecret: string): string {
  return createHash("sha256").update(`pass-cookie-v1:${sessionSecret}`).digest("base64url");
}

export function weekPass(): PassDef {
  const d = getPass(CATALOG, WEEK_PASS_ID);
  if (!d) throw new Error(`pass "${WEEK_PASS_ID}" missing from the WebhookTrail catalog`);
  return d;
}

/** What a free owner gets while the pass is active. */
export function passLimits(): PlanLimits {
  const g = applyPassGrants(FREE_PLAN.limits, FREE_PLAN.features, [weekPass()]);
  return limitsFromPlan(FREE_PLAN.id, g.limits, g.features, FREE_PLAN.name);
}

export function centsLabel(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** Copy values for the paywall and pricing page, straight from the catalog. */
export function passOffer(): PassOffer {
  const def = weekPass();
  const lim = passLimits();
  const developer = CATALOG.plans.find((p) => p.id === "developer")!;
  const days = Math.round(def.durationHours / 24);
  return {
    passId: def.id,
    name: def.name,
    price: centsLabel(def.priceCents),
    durationLabel: def.durationHours % 24 === 0 ? `${days} day${days === 1 ? "" : "s"}` : `${def.durationHours} hours`,
    endpoints: formatCount(lim.endpoints),
    lifetimeDays: Math.round((lim.endpointTtlHours ?? def.durationHours) / 24),
    historyDays: lim.historyDays,
    requestsStored: formatCount(lim.requestsStored),
    developerName: developer.name,
    developerPrice: priceLabel(developer),
  };
}

// ---------------------------------------------------------------------------------------------
// Owners and linked passes

export type Owner = { orgId: string } | { anonHash: string };

export function ownerKey(o: Owner): string {
  return "orgId" in o ? `org:${o.orgId}` : `anon:${o.anonHash}`;
}

/** Pass session ids linked to this owner that have not passed their expiry (billing re-checks refunds). */
export async function linkedPassIds(ex: SqlExecutor, owner: Owner, now = new Date()): Promise<string[]> {
  const { rows } = await ex.query<{ id: string }>(
    `SELECT pass_session_id AS id FROM hp_pass_links WHERE owner_key = $1 AND expires_at > $2 ORDER BY expires_at DESC LIMIT 5`,
    [ownerKey(owner), now.toISOString()],
  );
  return rows.map((r) => r.id);
}

/**
 * Server-side limits of an endpoint owner: plan (orgs) or free (anonymous) + passes bought by the org + passes
 * linked to the owner + `extraPassIds` (the current viewer's verified cookie).
 */
export async function ownerLimits(
  p: Pick<Platform, "billing" | "handle">,
  owner: { orgId?: string | null; anonHash?: string | null },
  extraPassIds: string[] = [],
): Promise<PlanLimits> {
  const ex = p.handle.executor;
  const o: Owner | null = owner.orgId ? { orgId: owner.orgId } : owner.anonHash ? { anonHash: owner.anonHash } : null;
  const linked = o ? await linkedPassIds(ex, o) : [];
  const passIds = [...new Set([...extraPassIds, ...linked])];
  if (!owner.orgId && passIds.length === 0) return limitsFromPlan(FREE_PLAN.id, FREE_PLAN.limits, FREE_PLAN.features, FREE_PLAN.name);
  const ent = await p.billing.getEntitlements(owner.orgId ?? null, { passIds });
  return limitsFromPlan(ent.planId, ent.limits, ent.features, ent.planName);
}

/**
 * Links the viewer's active cookie passes to the viewer's owners (workspace and anonymous owner token). A new link
 * upgrades that owner's live endpoints at once (see applyPassToOwner). Returns the active cookie passes.
 */
export async function linkViewerPasses(
  p: Pick<Platform, "billing" | "handle">,
  viewer: { passIds: string[]; org: { id: string } | null; anonHash: string | null },
  now = new Date(),
): Promise<ActivePass[]> {
  if (viewer.passIds.length === 0) return [];
  const active = await p.billing.getActivePasses({ passIds: viewer.passIds });
  if (active.length === 0) return [];
  const owners: Owner[] = [];
  if (viewer.org) owners.push({ orgId: viewer.org.id });
  if (viewer.anonHash) owners.push({ anonHash: viewer.anonHash });
  for (const pass of active) {
    for (const owner of owners) {
      if (await linkPass(p, pass, owner, now)) await applyPassToOwner(p, owner, now);
    }
  }
  return active;
}

/** Inserts the link (idempotent). False when it already existed or the pass reached MAX_OWNERS_PER_PASS. */
export async function linkPass(p: Pick<Platform, "handle">, pass: ActivePass, owner: Owner, now = new Date()): Promise<boolean> {
  const key = ownerKey(owner);
  // Fast path (every API call of a pass holder lands here): already linked, no transaction needed.
  const { rows: linked } = await p.handle.executor.query(`SELECT 1 FROM hp_pass_links WHERE pass_session_id = $1 AND owner_key = $2`, [
    pass.id,
    key,
  ]);
  if (linked.length > 0) return false;
  return p.handle.transaction(async (tx) => {
    await withOrgLock(tx, `pass:${pass.id}`);
    const { rows: existing } = await tx.query<{ owner_key: string }>(`SELECT owner_key FROM hp_pass_links WHERE pass_session_id = $1`, [
      pass.id,
    ]);
    if (existing.some((r) => r.owner_key === key)) return false;
    if (existing.length >= MAX_OWNERS_PER_PASS) return false;
    await tx.query(`INSERT INTO hp_pass_links (pass_session_id, owner_key, expires_at, created_at) VALUES ($1, $2, $3, $4)`, [
      pass.id,
      key,
      pass.expiresAt.toISOString(),
      now.toISOString(),
    ]);
    return true;
  });
}

/**
 * Applies the owner's current limits (now including the pass) to its live endpoints, the way an upgrade or a claim
 * does: endpoints above the old count are unlocked, the stored-request limit is raised and expiring endpoints get
 * the pass lifetime counted from creation (never shortened). Paid workspaces keep their non-expiring endpoints.
 */
export async function applyPassToOwner(p: Pick<Platform, "billing" | "handle">, owner: Owner, now = new Date()): Promise<void> {
  await enforceOwnerLimits(p, owner, now);
  const lim = await ownerLimits(p, "orgId" in owner ? { orgId: owner.orgId } : { anonHash: owner.anonHash });
  const ex = p.handle.executor;
  const where = "orgId" in owner ? `org_id = $1` : `org_id IS NULL AND anon_owner_hash = $1`;
  const id = "orgId" in owner ? owner.orgId : owner.anonHash;
  if (lim.endpointTtlHours !== null) {
    await ex.query(
      `UPDATE endpoints SET expires_at = GREATEST(expires_at, created_at + make_interval(hours => $2::int))
       WHERE ${where} AND deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at > $3`,
      [id, lim.endpointTtlHours, now.toISOString()],
    );
  }
  await ex.query(
    `UPDATE endpoints SET max_requests = $2 WHERE ${where} AND deleted_at IS NULL AND max_requests < $2`,
    [id, lim.requestsStored],
  );
}

/** Pass status for the viewer (UI note). unlockPath only for a pass this browser holds or the workspace bought. */
export async function viewerPassInfo(
  p: Pick<Platform, "billing" | "handle">,
  viewer: { passIds: string[]; org: { id: string } | null; anonHash: string | null },
): Promise<{ name: string; expiresAt: string; unlockPath: string | null } | null> {
  const ex = p.handle.executor;
  const linked = [
    ...(viewer.org ? await linkedPassIds(ex, { orgId: viewer.org.id }) : []),
    ...(viewer.anonHash ? await linkedPassIds(ex, { anonHash: viewer.anonHash }) : []),
  ];
  const ids = [...new Set([...viewer.passIds, ...linked])];
  if (ids.length === 0 && !viewer.org) return null;
  const active = await p.billing.getActivePasses({ orgId: viewer.org?.id ?? null, passIds: ids });
  const pass = active[0];
  if (!pass) return null;
  const mine = viewer.passIds.includes(pass.id) || (viewer.org !== null && pass.orgId === viewer.org.id);
  return {
    name: pass.name,
    expiresAt: pass.expiresAt.toISOString(),
    unlockPath: mine ? `/api/billing/pass/claim?session_id=${encodeURIComponent(pass.id)}&next=%2F` : null,
  };
}
