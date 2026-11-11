import type { SqlExecutor } from "@repo/database";
import { newSlug } from "./ids";
import type { Owner } from "./owner";
import { limits, PLANS, type PlanId } from "./plans";
import type { EndpointDTO, ResponseContentType } from "./types";
import type { CustomResponseInput } from "./validation";

export interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  created_at: Date | string;
  expires_at: Date | string;
  max_requests: number;
  request_count: number | string;
  stored_count?: number | string;
  last_request_at: Date | string | null;
  response_status: number;
  response_content_type: string;
  response_body: string | null;
  deleted_at: Date | string | null;
}

const COLUMNS = `id, slug, name, plan, created_at, expires_at, max_requests, request_count, last_request_at,
  response_status, response_content_type, response_body, deleted_at`;

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();

export function planOf(row: { plan: string }) {
  return PLANS[(row.plan in PLANS ? row.plan : "free") as PlanId];
}

export function maxExpiresAt(row: { plan: string; created_at: Date | string }): Date {
  return new Date(new Date(row.created_at).getTime() + planOf(row).maxLifetimeHours * 3_600_000);
}

export function toEndpointDTO(row: EndpointRow, origin: string, now = new Date()): EndpointDTO {
  const plan = planOf(row);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    captureUrl: `${origin}/h/${row.slug}`,
    plan: plan.id,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    expired: new Date(row.expires_at).getTime() <= now.getTime(),
    maxRequests: row.max_requests,
    requestCount: Number(row.request_count),
    storedCount: Number(row.stored_count ?? 0),
    lastRequestAt: row.last_request_at ? iso(row.last_request_at) : null,
    response: {
      status: row.response_status,
      contentType: row.response_content_type as ResponseContentType,
      body: row.response_body,
    },
    limits: {
      storedBodyBytes: plan.storedBodyBytes,
      maxBodyBytes: plan.maxBodyBytes,
      retentionHours: plan.retentionHours,
      maxExpiresAt: maxExpiresAt(row).toISOString(),
    },
  };
}

/** SQL fragment restricting to endpoints the owner may see. Params: $2 = anon hash, $3 = user id. */
const OWNED = `((($2)::text IS NOT NULL AND anon_owner_hash = ($2)::text) OR (($3)::uuid IS NOT NULL AND owner_user_id = ($3)::uuid))`;

export async function countActiveAnonEndpoints(ex: SqlExecutor, anonHash: string, now = new Date()): Promise<number> {
  const { rows } = await ex.query<{ n: number | string }>(
    `SELECT count(*)::int AS n FROM endpoints WHERE anon_owner_hash = $1 AND deleted_at IS NULL AND expires_at > $2`,
    [anonHash, now.toISOString()],
  );
  return Number(rows[0]?.n ?? 0);
}

export type CreateResult = { ok: true; row: EndpointRow } | { ok: false; reason: "limit_reached" };

export async function createAnonEndpoint(
  ex: SqlExecutor,
  anonHash: string,
  opts: { name?: string; now?: Date } = {},
): Promise<CreateResult> {
  const now = opts.now ?? new Date();
  if ((await countActiveAnonEndpoints(ex, anonHash, now)) >= limits.anonActiveEndpoints) {
    return { ok: false, reason: "limit_reached" };
  }
  const plan = PLANS.free;
  const expires = new Date(now.getTime() + plan.retentionHours * 3_600_000);
  const { rows } = await ex.query<EndpointRow>(
    `INSERT INTO endpoints (slug, name, anon_owner_hash, plan, created_at, expires_at, max_requests)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [newSlug(), opts.name ?? "Untitled endpoint", anonHash, plan.id, now.toISOString(), expires.toISOString(), plan.historyPerEndpoint],
  );
  return { ok: true, row: { ...rows[0]!, stored_count: 0 } };
}

export async function listOwnedEndpoints(ex: SqlExecutor, owner: Owner): Promise<EndpointRow[]> {
  const { rows } = await ex.query<EndpointRow>(
    `SELECT ${COLUMNS},
       (SELECT count(*)::int FROM captured_requests r WHERE r.endpoint_id = endpoints.id) AS stored_count
     FROM endpoints
     WHERE deleted_at IS NULL AND ${OWNED.replace(/\$2/g, "$1").replace(/\$3/g, "$2")}
     ORDER BY created_at DESC
     LIMIT 200`,
    [owner.anonHash, owner.userId],
  );
  return rows;
}

/** The endpoint if (and only if) it exists, is not deleted, and belongs to `owner`. */
export async function getOwnedEndpoint(ex: SqlExecutor, owner: Owner, id: string): Promise<EndpointRow | null> {
  const { rows } = await ex.query<EndpointRow>(
    `SELECT ${COLUMNS},
       (SELECT count(*)::int FROM captured_requests r WHERE r.endpoint_id = endpoints.id) AS stored_count
     FROM endpoints
     WHERE id = $1 AND deleted_at IS NULL AND ${OWNED}`,
    [id, owner.anonHash, owner.userId],
  );
  return rows[0] ?? null;
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
  if (patch.expiresInHours !== undefined) {
    const plan = planOf(row);
    const hours = Math.min(patch.expiresInHours, plan.retentionHours);
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
