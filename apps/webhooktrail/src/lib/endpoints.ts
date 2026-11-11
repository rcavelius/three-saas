import { withOrgLock } from "@repo/billing";
import type { SqlExecutor } from "@repo/database";
import { newSlug } from "./ids";
import { orgLimits } from "./org-data";
import { FREE_LIMITS, limits, type PlanLimits } from "./plans";
import type { Platform } from "./platform";
import type { EndpointDTO, ResponseContentType } from "./types";
import type { CustomResponseInput } from "./validation";
import { canManage, type Viewer } from "./viewer";

export interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  org_id: string | null;
  created_at: Date | string;
  expires_at: Date | string | null;
  locked_at: Date | string | null;
  max_requests: number;
  request_count: number | string;
  stored_count?: number | string;
  last_request_at: Date | string | null;
  response_status: number;
  response_content_type: string;
  response_body: string | null;
  deleted_at: Date | string | null;
}

export const ENDPOINT_COLUMNS = `id, slug, name, org_id, created_at, expires_at, locked_at, max_requests, request_count,
  last_request_at, response_status, response_content_type, response_body, deleted_at`;

const STORED_COUNT = `(SELECT count(*)::int FROM captured_requests r WHERE r.endpoint_id = endpoints.id) AS stored_count`;

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();

export function isExpired(row: { expires_at: Date | string | null }, now = new Date()): boolean {
  return row.expires_at !== null && new Date(row.expires_at).getTime() <= now.getTime();
}

/** Latest expiry a free/anonymous endpoint can be extended to (counted from creation). */
export function maxExpiresAt(row: { created_at: Date | string }): Date {
  return new Date(new Date(row.created_at).getTime() + limits.freeMaxLifetimeHours * 3_600_000);
}

export function toEndpointDTO(row: EndpointRow, origin: string, lim: PlanLimits, viewer: Viewer, now = new Date()): EndpointDTO {
  const orgOwned = row.org_id !== null;
  const manage = orgOwned ? canManage(viewer.org?.role) : true;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    captureUrl: `${origin}/h/${row.slug}`,
    plan: lim.planId,
    planName: lim.planName,
    owner: orgOwned ? "org" : "anonymous",
    createdAt: iso(row.created_at),
    expiresAt: row.expires_at ? iso(row.expires_at) : null,
    expired: isExpired(row, now),
    locked: row.locked_at !== null,
    maxRequests: lim.requestsStored,
    requestCount: Number(row.request_count),
    storedCount: Number(row.stored_count ?? 0),
    lastRequestAt: row.last_request_at ? iso(row.last_request_at) : null,
    response: {
      status: row.response_status,
      contentType: row.response_content_type as ResponseContentType,
      body: row.response_body,
    },
    limits: {
      storedBodyBytes: lim.storedBodyBytes,
      maxBodyBytes: lim.maxBodyBytes,
      requestsPerMonth: lim.requestsPerMonth,
      historyDays: lim.historyDays,
      ttlHours: row.expires_at === null ? null : (lim.endpointTtlHours ?? FREE_LIMITS.endpointTtlHours),
      maxExpiresAt: row.expires_at === null ? null : maxExpiresAt(row).toISOString(),
    },
    permissions: {
      canDelete: manage,
      canReplay: orgOwned && lim.replay,
      canManageDestinations: orgOwned && canManage(viewer.org?.role),
    },
  };
}

/**
 * Visibility rule for every inspection query: an endpoint of the viewer's (verified) org, or an
 * unclaimed anonymous endpoint whose owner-token hash matches the viewer's cookie.
 * Params: $2 = org id (or null), $3 = anon hash (or null).
 */
const VISIBLE = `deleted_at IS NULL AND (
  (org_id IS NOT NULL AND org_id = ($2)::text) OR
  (org_id IS NULL AND ($3)::text IS NOT NULL AND anon_owner_hash = ($3)::text))`;

export async function getVisibleEndpoint(ex: SqlExecutor, viewer: Viewer, id: string): Promise<EndpointRow | null> {
  const { rows } = await ex.query<EndpointRow>(
    `SELECT ${ENDPOINT_COLUMNS}, ${STORED_COUNT} FROM endpoints WHERE id = $1 AND ${VISIBLE}`,
    [id, viewer.org?.id ?? null, viewer.anonHash],
  );
  return rows[0] ?? null;
}

export async function listOrgEndpoints(ex: SqlExecutor, orgId: string): Promise<EndpointRow[]> {
  const { rows } = await ex.query<EndpointRow>(
    `SELECT ${ENDPOINT_COLUMNS}, ${STORED_COUNT} FROM endpoints
     WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`,
    [orgId],
  );
  return rows;
}

export async function listAnonEndpoints(ex: SqlExecutor, anonHash: string): Promise<EndpointRow[]> {
  const { rows } = await ex.query<EndpointRow>(
    `SELECT ${ENDPOINT_COLUMNS}, ${STORED_COUNT} FROM endpoints
     WHERE org_id IS NULL AND anon_owner_hash = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`,
    [anonHash],
  );
  return rows;
}

const ACTIVE = (now: string) => `deleted_at IS NULL AND locked_at IS NULL AND (expires_at IS NULL OR expires_at > '${now}'::timestamptz)`;

export type CreateResult = { ok: true; row: EndpointRow; limits: PlanLimits } | { ok: false; reason: "limit_reached"; limit: number };

/** Creates an endpoint for the viewer's org (signed in) or anonymous owner hash. Gauge limit counted under a lock. */
export async function createEndpoint(
  p: Pick<Platform, "handle" | "billing">,
  owner: { orgId: string; userId: string } | { anonHash: string },
  opts: { name?: string; now?: Date } = {},
): Promise<CreateResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const isOrg = "orgId" in owner;
  const lim = isOrg ? await orgLimits(p, owner.orgId) : FREE_LIMITS;
  return p.handle.transaction(async (tx) => {
    // Serialises "count then insert" per owner so concurrent creations cannot exceed the limit.
    await withOrgLock(tx, isOrg ? owner.orgId : `anon:${owner.anonHash}`);
    const { rows: c } = await tx.query<{ n: number }>(
      isOrg
        ? `SELECT count(*)::int AS n FROM endpoints WHERE org_id = $1 AND ${ACTIVE(nowIso)}`
        : `SELECT count(*)::int AS n FROM endpoints WHERE org_id IS NULL AND anon_owner_hash = $1 AND ${ACTIVE(nowIso)}`,
      [isOrg ? owner.orgId : owner.anonHash],
    );
    if (lim.endpoints >= 0 && Number(c[0]?.n ?? 0) >= lim.endpoints) {
      return { ok: false as const, reason: "limit_reached" as const, limit: lim.endpoints };
    }
    const expires = lim.endpointTtlHours === null ? null : new Date(now.getTime() + lim.endpointTtlHours * 3_600_000).toISOString();
    const { rows } = await tx.query<EndpointRow>(
      `INSERT INTO endpoints (slug, name, org_id, created_by, anon_owner_hash, plan, created_at, expires_at, max_requests)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${ENDPOINT_COLUMNS}`,
      [
        newSlug(),
        opts.name ?? "Untitled endpoint",
        isOrg ? owner.orgId : null,
        isOrg ? owner.userId : null,
        isOrg ? null : owner.anonHash,
        lim.planId,
        nowIso,
        expires,
        lim.requestsStored,
      ],
    );
    return { ok: true as const, row: { ...rows[0]!, stored_count: 0 }, limits: lim };
  });
}

export interface ClaimResult {
  claimed: string[];
  /** Anonymous endpoints left unclaimed because the plan's endpoint limit was reached. */
  skipped: string[];
}

/**
 * Moves the caller's anonymous endpoints (only those whose owner-token hash matches the cookie)
 * into their org, oldest first, up to the plan's endpoint limit. Expired ones are not claimed.
 */
export async function claimAnonEndpoints(
  p: Pick<Platform, "handle" | "billing">,
  orgId: string,
  userId: string,
  anonHash: string,
  now = new Date(),
): Promise<ClaimResult> {
  const lim = await orgLimits(p, orgId);
  const nowIso = now.toISOString();
  return p.handle.transaction(async (tx) => {
    await withOrgLock(tx, orgId);
    await withOrgLock(tx, `anon:${anonHash}`);
    const { rows: c } = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM endpoints WHERE org_id = $1 AND ${ACTIVE(nowIso)}`,
      [orgId],
    );
    const { rows: anon } = await tx.query<{ id: string }>(
      `SELECT id FROM endpoints WHERE org_id IS NULL AND anon_owner_hash = $1 AND ${ACTIVE(nowIso)}
       ORDER BY created_at ASC, id ASC`,
      [anonHash],
    );
    const room = lim.endpoints < 0 ? anon.length : Math.max(0, lim.endpoints - Number(c[0]?.n ?? 0));
    const claim = anon.slice(0, room).map((r) => r.id);
    const skipped = anon.slice(room).map((r) => r.id);
    if (claim.length > 0) {
      await tx.query(
        `UPDATE endpoints SET org_id = $2, created_by = $3, anon_owner_hash = NULL, plan = $4,
           max_requests = $5, expires_at = CASE WHEN $6::boolean THEN NULL ELSE expires_at END
         WHERE id = ANY($1::uuid[]) AND org_id IS NULL AND anon_owner_hash = $7`,
        [claim, orgId, userId, lim.planId, lim.requestsStored, lim.endpointTtlHours === null, anonHash],
      );
    }
    return { claimed: claim, skipped };
  });
}

export async function updateEndpoint(
  ex: SqlExecutor,
  row: EndpointRow,
  patch: { name?: string; expiresInHours?: number; response?: CustomResponseInput | null },
  now = new Date(),
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [row.id];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.expiresInHours !== undefined && row.expires_at !== null) {
    const hours = Math.min(patch.expiresInHours, FREE_LIMITS.endpointTtlHours ?? 24);
    const wanted = new Date(now.getTime() + hours * 3_600_000);
    const cap = maxExpiresAt(row);
    add("expires_at", (wanted.getTime() > cap.getTime() ? cap : wanted).toISOString());
  }
  if (patch.response !== undefined) {
    if (patch.response === null) {
      add("response_status", 200);
      add("response_content_type", "application/json");
      add("response_body", null);
    } else {
      add("response_status", patch.response.status);
      add("response_content_type", patch.response.contentType);
      add("response_body", patch.response.body === "" && patch.response.contentType === "application/json" ? null : patch.response.body);
    }
  }
  if (sets.length === 0) return;
  await ex.query(`UPDATE endpoints SET ${sets.join(", ")} WHERE id = $1`, params);
}

/** Soft-deletes the endpoint (capture URL stops working at once) and hard-deletes its captured requests. */
export async function deleteEndpoint(ex: SqlExecutor, id: string, now = new Date()): Promise<void> {
  await ex.query(`UPDATE endpoints SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL`, [id, now.toISOString()]);
  await ex.query(`DELETE FROM captured_requests WHERE endpoint_id = $1`, [id]);
}
