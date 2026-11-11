/**
 * Monitored sites: add/remove under the plan's `sites` gauge (counted under withOrgLock), settings,
 * downgrade enforcement and org data purge. Every function takes the org id that the caller got from
 * auth.requireOrg(); nothing here trusts an org id from a request.
 */
import { withOrgLock, type Billing } from "@repo/billing";
import type { DbHandle, SqlExecutor } from "@repo/database";
import { checkTargetUrl } from "@repo/security";
import { normalizeInputUrl } from "../scan-handler";

export class SiteError extends Error {
  constructor(
    readonly code: "invalid_url" | "plan_required" | "limit_reached" | "duplicate" | "not_found" | "invalid_recipients" | "invalid_input",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SiteError";
  }
}

export interface SiteRow {
  id: string;
  orgId: string;
  url: string;
  host: string;
  createdAt: string;
  paused: boolean;
  planLocked: boolean;
  status: "pending" | "ok" | "unreachable";
  consecutiveFailures: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
  lastScanId: string | null;
  lastScore: number | null;
  lastError: string | null;
  alertsMuted: boolean;
  alertRecipients: string[];
}

const SITE_COLUMNS = `id::text AS id, org_id, url, host, created_at, paused, plan_locked, status, consecutive_failures,
  last_scan_at, next_scan_at, last_scan_id, last_score, last_error, alerts_muted, alert_recipients`;

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export function siteFromRow(r: Record<string, unknown>): SiteRow {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    url: String(r.url),
    host: String(r.host),
    createdAt: iso(r.created_at)!,
    paused: Boolean(r.paused),
    planLocked: Boolean(r.plan_locked),
    status: (r.status as SiteRow["status"]) ?? "pending",
    consecutiveFailures: Number(r.consecutive_failures ?? 0),
    lastScanAt: iso(r.last_scan_at),
    nextScanAt: iso(r.next_scan_at),
    lastScanId: (r.last_scan_id as string | null) ?? null,
    lastScore: r.last_score === null || r.last_score === undefined ? null : Number(r.last_score),
    lastError: (r.last_error as string | null) ?? null,
    alertsMuted: Boolean(r.alerts_muted),
    alertRecipients: Array.isArray(r.alert_recipients) ? (r.alert_recipients as string[]) : [],
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/** Validates (SSRF rules) and canonicalises a site address: https assumed, fragment dropped. */
export function normalizeSiteUrl(input: string): { url: string; host: string } {
  if (typeof input !== "string" || input.trim().length === 0 || input.length > 2048) {
    throw new SiteError("invalid_url", "Enter a website address.", 400);
  }
  const check = checkTargetUrl(normalizeInputUrl(input));
  if (!check.ok) throw new SiteError("invalid_url", "That address is not a public http(s) website on port 80 or 443.", 400);
  const u = new URL(check.url.href);
  u.hash = "";
  return { url: u.href, host: u.hostname };
}

export async function getSite(ex: SqlExecutor, orgId: string, siteId: string): Promise<SiteRow | null> {
  if (!isUuid(siteId)) return null;
  const { rows } = await ex.query<Record<string, unknown>>(`SELECT ${SITE_COLUMNS} FROM sites WHERE org_id = $1 AND id = $2`, [orgId, siteId]);
  return rows[0] ? siteFromRow(rows[0]) : null;
}

export interface SiteListItem extends SiteRow {
  openCritical: number;
  openWarnings: number;
  trend: number[];
}

export async function listSites(ex: SqlExecutor, orgId: string): Promise<SiteListItem[]> {
  const { rows } = await ex.query<Record<string, unknown>>(
    `SELECT ${SITE_COLUMNS},
       (SELECT count(*)::int FROM site_issues i WHERE i.site_id = s.id AND i.resolved_at IS NULL AND i.severity = 'critical') AS open_critical,
       (SELECT count(*)::int FROM site_issues i WHERE i.site_id = s.id AND i.resolved_at IS NULL AND i.severity = 'warning') AS open_warnings,
       (SELECT coalesce(json_agg(x.score ORDER BY x.created_at), '[]'::json) FROM
          (SELECT score, created_at FROM scans c WHERE c.site_id = s.id AND c.org_id = s.org_id ORDER BY created_at DESC LIMIT 10) x) AS trend
     FROM sites s WHERE s.org_id = $1 ORDER BY s.created_at ASC`,
    [orgId],
  );
  return rows.map((r) => ({
    ...siteFromRow(r),
    openCritical: Number(r.open_critical ?? 0),
    openWarnings: Number(r.open_warnings ?? 0),
    trend: (typeof r.trend === "string" ? JSON.parse(r.trend) : (r.trend as number[] | null)) ?? [],
  }));
}

export async function countActiveSites(ex: SqlExecutor, orgId: string): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM sites WHERE org_id = $1 AND plan_locked = false`, [orgId]);
  return Number(rows[0]?.n ?? 0);
}

export async function addSite(
  deps: { handle: DbHandle<any>; billing: Billing; now?: () => Date },
  orgId: string,
  input: string,
): Promise<SiteRow> {
  const { url, host } = normalizeSiteUrl(input);
  const ents = await deps.billing.getEntitlements(orgId);
  const limit = ents.limits.sites ?? 0;
  if (limit === 0) {
    throw new SiteError("plan_required", "Monitoring sites needs a paid plan. Free scans stay available without one.", 402);
  }
  const now = (deps.now ?? (() => new Date()))();
  return deps.handle.transaction(async (tx) => {
    await withOrgLock(tx, orgId);
    const { rows: c } = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM sites WHERE org_id = $1 AND plan_locked = false`, [orgId]);
    const used = Number(c[0]?.n ?? 0);
    if (limit !== -1 && used >= limit) {
      throw new SiteError("limit_reached", `Your ${ents.planName} plan includes ${limit} monitored site${limit === 1 ? "" : "s"}. Remove one or upgrade.`, 409);
    }
    const dup = await tx.query(`SELECT 1 FROM sites WHERE org_id = $1 AND url = $2`, [orgId, url]);
    if (dup.rows.length) throw new SiteError("duplicate", "This address is already monitored.", 409);
    const { rows } = await tx.query<Record<string, unknown>>(
      `INSERT INTO sites (org_id, url, host, created_at, next_scan_at) VALUES ($1, $2, $3, $4, $4) RETURNING ${SITE_COLUMNS}`,
      [orgId, url, host, now.toISOString()],
    );
    return siteFromRow(rows[0]!);
  });
}

/** Deletes a site and everything recorded for it. Returns false when it is not this org's site. */
export async function removeSite(deps: { handle: DbHandle<any>; billing: Billing }, orgId: string, siteId: string): Promise<boolean> {
  if (!isUuid(siteId)) return false;
  const removed = await deps.handle.transaction(async (tx) => {
    await withOrgLock(tx, orgId);
    const { rows } = await tx.query(`DELETE FROM sites WHERE org_id = $1 AND id = $2 RETURNING id`, [orgId, siteId]);
    if (!rows.length) return false;
    await tx.query(`DELETE FROM scans WHERE org_id = $1 AND site_id = $2`, [orgId, siteId]);
    await tx.query(`DELETE FROM site_issues WHERE org_id = $1 AND site_id = $2`, [orgId, siteId]);
    await tx.query(`DELETE FROM alerts WHERE org_id = $1 AND site_id = $2`, [orgId, siteId]);
    return true;
  });
  if (removed) await enforceSiteLimits(deps, orgId);
  return removed;
}

/** Org members (user ids) of this org: alert recipients must be among them. */
export async function orgMemberIds(ex: SqlExecutor, orgId: string): Promise<Set<string>> {
  const { rows } = await ex.query<{ user_id: string }>(`SELECT user_id FROM auth_member WHERE organization_id = $1`, [orgId]);
  return new Set(rows.map((r) => r.user_id));
}

export interface SitePatch {
  paused?: boolean;
  alertsMuted?: boolean;
  alertRecipients?: string[];
}

export async function updateSite(ex: SqlExecutor, orgId: string, siteId: string, patch: SitePatch, now: Date = new Date()): Promise<SiteRow | null> {
  const site = await getSite(ex, orgId, siteId);
  if (!site) return null;
  let recipients = site.alertRecipients;
  if (patch.alertRecipients !== undefined) {
    if (!Array.isArray(patch.alertRecipients) || patch.alertRecipients.length > 50) {
      throw new SiteError("invalid_recipients", "Choose up to 50 recipients.", 400);
    }
    const members = await orgMemberIds(ex, orgId);
    const unique = [...new Set(patch.alertRecipients)];
    if (unique.some((u) => typeof u !== "string" || !members.has(u))) {
      throw new SiteError("invalid_recipients", "Alert recipients must be members of this workspace.", 400);
    }
    recipients = unique;
  }
  const paused = patch.paused ?? site.paused;
  // Resuming schedules the next scan right away.
  const resumeNow = site.paused && !paused;
  const { rows } = await ex.query<Record<string, unknown>>(
    `UPDATE sites SET paused = $3, alerts_muted = $4, alert_recipients = $5::text[],
       next_scan_at = CASE WHEN $6 THEN $7::timestamptz ELSE next_scan_at END
     WHERE org_id = $1 AND id = $2 RETURNING ${SITE_COLUMNS}`,
    [orgId, siteId, paused, patch.alertsMuted ?? site.alertsMuted, recipients, resumeNow, now.toISOString()],
  );
  return rows[0] ? siteFromRow(rows[0]) : null;
}

/**
 * Applies the plan's site limit: the OLDEST `limit` sites stay active, newer excess sites are locked
 * (paused, never deleted). Raising the limit unlocks them again, oldest first.
 */
export async function enforceSiteLimits(
  deps: { handle: DbHandle<any>; billing: Billing },
  orgId: string,
): Promise<{ locked: number; unlocked: number }> {
  const ents = await deps.billing.getEntitlements(orgId);
  const limit = ents.limits.sites ?? 0;
  const scheduled = ents.features.scheduledScans === true;
  return deps.handle.transaction(async (tx) => {
    await withOrgLock(tx, orgId);
    const { rows } = await tx.query<{ id: string; plan_locked: boolean }>(
      `SELECT id::text AS id, plan_locked FROM sites WHERE org_id = $1 ORDER BY created_at ASC, id ASC`,
      [orgId],
    );
    let locked = 0;
    let unlocked = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const shouldLock = !scheduled || (limit !== -1 && i >= limit);
      if (shouldLock && !r.plan_locked) {
        await tx.query(`UPDATE sites SET plan_locked = true WHERE id = $1`, [r.id]);
        locked++;
      } else if (!shouldLock && r.plan_locked) {
        await tx.query(`UPDATE sites SET plan_locked = false, next_scan_at = coalesce(next_scan_at, now()) WHERE id = $1`, [r.id]);
        unlocked++;
      }
    }
    // Account scan retention follows the plan's history window (latest scan per site is always kept).
    const historyDays = Math.max(0, ents.limits.historyDays ?? 0);
    await tx.query(
      `UPDATE scans SET expires_at = created_at + make_interval(days => $2) WHERE org_id = $1`,
      [orgId, historyDays],
    );
    return { locked, unlocked };
  });
}

/** Removes every SiteProof row of an org (account deletion). */
export async function purgeOrgData(ex: SqlExecutor, orgId: string): Promise<void> {
  await ex.query(`DELETE FROM alerts WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM site_issues WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM scans WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM sites WHERE org_id = $1`, [orgId]);
  await ex.query(`DELETE FROM billing_usage WHERE org_id = $1`, [orgId]);
}
