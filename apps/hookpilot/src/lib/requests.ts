import type { SqlExecutor } from "@repo/database";
import type { RequestDetailDTO, RequestListDTO, RequestSummaryDTO } from "./types";
import type { ListRequestsQuery } from "./validation";

interface SummaryRow {
  id: string;
  seq: string;
  method: string;
  path: string;
  query: string;
  content_type: string | null;
  body_size: number;
  body_truncated: boolean;
  source_ip: string | null;
  received_at: Date | string;
}

interface DetailRow extends SummaryRow {
  headers: [string, string][] | string;
  body: Uint8Array | null;
}

const SUMMARY_COLS = `id, seq::text AS seq, method, path, query, content_type, body_size, body_truncated, source_ip, received_at`;

function toSummary(r: SummaryRow): RequestSummaryDTO {
  return {
    id: r.id,
    cursor: String(r.seq),
    method: r.method,
    path: r.path,
    query: r.query,
    contentType: r.content_type,
    bodySize: Number(r.body_size),
    truncated: Boolean(r.body_truncated),
    sourceIp: r.source_ip,
    receivedAt: (r.received_at instanceof Date ? r.received_at : new Date(r.received_at)).toISOString(),
  };
}

/** Escapes LIKE wildcards so user text is matched literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Lists an endpoint's requests (caller has already checked ownership).
 * - default / ?before=<cursor>: newest first, older pages via nextCursor
 * - ?after=<cursor>: only requests newer than the cursor, newest first (live polling)
 * Text search (?q=) is bounded: q <= 200 chars and scans only this endpoint's stored requests
 * (capped by the plan's history limit, bodies <= the stored-body cap).
 */
export async function listRequests(ex: SqlExecutor, endpointId: string, q: ListRequestsQuery): Promise<RequestListDTO> {
  const where: string[] = ["endpoint_id = $1"];
  const params: unknown[] = [endpointId];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (q.method) where.push(`method = ${p(q.method)}`);
  if (q.from) where.push(`received_at >= ${p(new Date(q.from).toISOString())}`);
  if (q.to) where.push(`received_at <= ${p(new Date(q.to).toISOString())}`);
  if (q.before) where.push(`seq < ${p(q.before)}::bigint`);
  if (q.after) where.push(`seq > ${p(q.after)}::bigint`);
  if (q.q) {
    const pat = p(likePattern(q.q));
    const raw = p(q.q);
    where.push(`(path ILIKE ${pat} OR query ILIKE ${pat} OR headers::text ILIKE ${pat}
      OR (body IS NOT NULL AND (position(convert_to(${raw}, 'UTF8') IN body) > 0 OR encode(body, 'escape') ILIKE ${pat})))`);
  }
  const limit = q.limit;
  const { rows } = await ex.query<SummaryRow>(
    `SELECT ${SUMMARY_COLS} FROM captured_requests WHERE ${where.join(" AND ")} ORDER BY captured_requests.seq DESC LIMIT ${p(limit + 1)}`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(toSummary);
  return { requests: page, nextCursor: hasMore && !q.after ? page[page.length - 1]!.cursor : null };
}

export async function getRequest(ex: SqlExecutor, endpointId: string, requestId: string): Promise<RequestDetailDTO | null> {
  const { rows } = await ex.query<DetailRow>(
    `SELECT ${SUMMARY_COLS}, headers, body FROM captured_requests WHERE endpoint_id = $1 AND id = $2`,
    [endpointId, requestId],
  );
  const r = rows[0];
  if (!r) return null;
  const headers = typeof r.headers === "string" ? (JSON.parse(r.headers) as [string, string][]) : r.headers;
  const body = r.body ? Buffer.from(r.body) : Buffer.alloc(0);
  return { ...toSummary(r), headers, bodyBase64: body.toString("base64"), storedBodySize: body.byteLength };
}

export async function deleteRequest(ex: SqlExecutor, endpointId: string, requestId: string): Promise<boolean> {
  const { rows } = await ex.query<{ id: string }>(
    `DELETE FROM captured_requests WHERE endpoint_id = $1 AND id = $2 RETURNING id`,
    [endpointId, requestId],
  );
  return rows.length > 0;
}

export async function clearRequests(ex: SqlExecutor, endpointId: string): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(
    `WITH d AS (DELETE FROM captured_requests WHERE endpoint_id = $1 RETURNING 1) SELECT count(*)::int AS n FROM d`,
    [endpointId],
  );
  return Number(rows[0]?.n ?? 0);
}

export interface NewCapturedRequest {
  endpointId: string;
  method: string;
  path: string;
  query: string;
  headers: [string, string][];
  body: Uint8Array;
  bodySize: number;
  truncated: boolean;
  contentType: string | null;
  sourceIp: string;
  maxRequests: number;
}

/** Stores a request, bumps the endpoint counter and prunes the oldest beyond the history limit. */
export async function insertCapturedRequest(ex: SqlExecutor, r: NewCapturedRequest): Promise<string> {
  const { rows } = await ex.query<{ id: string }>(
    `INSERT INTO captured_requests (endpoint_id, method, path, query, headers, body, body_size, body_truncated, content_type, source_ip)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10) RETURNING id`,
    [
      r.endpointId,
      r.method,
      r.path,
      r.query,
      JSON.stringify(r.headers),
      r.body.byteLength > 0 ? Buffer.from(r.body.buffer, r.body.byteOffset, r.body.byteLength) : null,
      r.bodySize,
      r.truncated,
      r.contentType,
      r.sourceIp,
    ],
  );
  await ex.query(`UPDATE endpoints SET request_count = request_count + 1, last_request_at = now() WHERE id = $1`, [r.endpointId]);
  await ex.query(
    `DELETE FROM captured_requests WHERE id IN (
       SELECT id FROM captured_requests WHERE endpoint_id = $1 ORDER BY seq DESC OFFSET $2
     )`,
    [r.endpointId, r.maxRequests],
  );
  return rows[0]!.id;
}
