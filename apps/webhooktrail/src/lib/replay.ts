/**
 * Secure replay of a captured request to a VERIFIED destination of the same org.
 *
 * Guarantees (each covered by src/test/replay.test.ts):
 * - only a destination id is accepted (never a URL from the form); it must belong to the caller's
 *   org (404 otherwise) and be verified for its current URL (409 otherwise);
 * - delivery goes through @repo/security safeDeliver: public unicast IPs only (checked after DNS,
 *   socket pinned to the checked IP), ports 80/443, no redirects followed, header denylist,
 *   1 MB request body cap, 64 KB response cap; never the WebhookTrail host itself;
 * - sensitive headers are left out unless ticked for this replay; signature headers are sent with a
 *   staleness warning;
 * - rate limited per org and per destination; every attempt is an audit row (who, when, where,
 *   status, elapsed);
 * - "replay with retries": attempt 1 runs now, later attempts run from the job queue with backoff
 *   until one gets a 2xx or N (max 5) attempts were made.
 */
import { randomUUID } from "node:crypto";
import { enqueueJob, rateLimit, type SqlExecutor } from "@repo/database";
import { SafeFetchError, safeDeliver } from "@repo/security";
import { checkDestinationUrl, getDestination } from "./destinations";
import type { EndpointRow } from "./endpoints";
import { appLogger } from "./log";
import { orgLimits } from "./org-data";
import { limits, type PlanLimits } from "./plans";
import type { Platform } from "./platform";
import { MAX_REPLAY_BODY_BYTES, planReplayHeaders, REPLAYABLE_METHODS, type ReplayHeaderPlan } from "./replay-headers";
import { getRawRequest } from "./requests";
import type { ReplayDTO, ReplayStatus } from "./types";

const log = appLogger("replay");

export const REPLAY_QUEUE = "webhooktrail.replay";
export const REPLAY_TIMEOUT_MS = 15_000;
export const REPLAY_RESPONSE_CAP = 64 * 1024;
const PREVIEW_BYTES = 4096;

/** Delay before attempt n+1 after attempt n failed: 10 s, 20 s, 40 s, 80 s. */
export function retryDelayMs(attempt: number): number {
  return 10_000 * 2 ** Math.max(0, attempt - 1);
}

interface ReplayRow {
  id: string;
  org_id: string;
  batch_id: string;
  endpoint_id: string | null;
  request_id: string | null;
  destination_id: string | null;
  destination_url: string;
  user_id: string | null;
  included_sensitive: string[] | string;
  attempt: number;
  attempts_total: number;
  status: ReplayStatus;
  response_status: number | null;
  elapsed_ms: number | null;
  error_code: string | null;
  error: string | null;
  response_body_preview: string | null;
  response_truncated: boolean;
  run_at: Date | string;
  created_at: Date | string;
  finished_at: Date | string | null;
  by_name?: string | null;
  by_email?: string | null;
}

const COLS = `r.id, r.org_id, r.batch_id, r.endpoint_id, r.request_id, r.destination_id, r.destination_url, r.user_id,
  r.included_sensitive, r.attempt, r.attempts_total, r.status, r.response_status, r.elapsed_ms, r.error_code, r.error,
  r.response_body_preview, r.response_truncated, r.run_at, r.created_at, r.finished_at`;

const iso = (d: Date | string | null) => (d === null ? null : (d instanceof Date ? d : new Date(d)).toISOString());
const jsonList = (v: string[] | string): string[] => (typeof v === "string" ? (JSON.parse(v) as string[]) : v);

export function toReplayDTO(r: ReplayRow): ReplayDTO {
  return {
    id: r.id,
    batchId: r.batch_id,
    requestId: r.request_id,
    destinationId: r.destination_id,
    destinationUrl: r.destination_url,
    by: r.by_name || r.by_email || null,
    attempt: r.attempt,
    attemptsTotal: r.attempts_total,
    status: r.status,
    responseStatus: r.response_status,
    elapsedMs: r.elapsed_ms,
    errorCode: r.error_code,
    error: r.error,
    responseBodyPreview: r.response_body_preview,
    responseTruncated: Boolean(r.response_truncated),
    includedSensitive: jsonList(r.included_sensitive),
    runAt: iso(r.run_at)!,
    createdAt: iso(r.created_at)!,
    finishedAt: iso(r.finished_at),
  };
}

async function loadReplay(ex: SqlExecutor, id: string): Promise<ReplayRow | null> {
  const { rows } = await ex.query<ReplayRow>(
    `SELECT ${COLS}, u.name AS by_name, u.email AS by_email FROM hp_replays r LEFT JOIN auth_user u ON u.id = r.user_id WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Audit rows of one captured request (org-scoped). */
export async function listReplays(ex: SqlExecutor, orgId: string, filter: { requestId?: string; endpointId?: string }): Promise<ReplayDTO[]> {
  const { rows } = await ex.query<ReplayRow>(
    `SELECT ${COLS}, u.name AS by_name, u.email AS by_email FROM hp_replays r LEFT JOIN auth_user u ON u.id = r.user_id
     WHERE r.org_id = $1 AND ($2::uuid IS NULL OR r.request_id = $2::uuid) AND ($3::uuid IS NULL OR r.endpoint_id = $3::uuid)
     ORDER BY r.created_at DESC, r.attempt DESC LIMIT 100`,
    [orgId, filter.requestId ?? null, filter.endpointId ?? null],
  );
  return rows.map(toReplayDTO);
}

export type StartReplayResult =
  | { ok: true; batchId: string; replays: ReplayDTO[]; headers: Omit<ReplayHeaderPlan, "send"> & { sent: string[] } }
  | { ok: false; status: number; code: string; message: string; retryAfterSeconds?: number };

const fail = (status: number, code: string, message: string, extra: { retryAfterSeconds?: number } = {}): StartReplayResult => ({
  ok: false,
  status,
  code,
  message,
  ...extra,
});

export async function startReplay(
  p: Platform,
  ctx: { orgId: string; userId: string; endpoint: EndpointRow; limits: PlanLimits },
  requestId: string,
  input: { destinationId: string; includeSensitiveHeaders: string[]; attempts: number },
  now = new Date(),
): Promise<StartReplayResult> {
  if (ctx.endpoint.org_id !== ctx.orgId) return fail(403, "account_required", "Claim this endpoint into your workspace to replay its requests.");
  if (!ctx.limits.replay) return fail(403, "plan_required", "Replay is available on the Developer and Pro plans.");
  const dest = await getDestination(p.ex, ctx.orgId, input.destinationId);
  if (!dest) return fail(404, "not_found", "Destination not found.");
  if (!dest.verified_at) return fail(409, "destination_not_verified", "Verify this destination before replaying to it.");
  const check = checkDestinationUrl(p, dest.url);
  if (!check.ok) return fail(422, "destination_blocked", check.message);
  const raw = await getRawRequest(p.ex, ctx.endpoint.id, requestId);
  if (!raw) return fail(404, "not_found", "Request not found.");
  if (!(REPLAYABLE_METHODS as readonly string[]).includes(raw.method)) {
    return fail(422, "method_not_replayable", `${raw.method} requests cannot be replayed.`);
  }
  if (raw.body.byteLength > MAX_REPLAY_BODY_BYTES) {
    return fail(413, "body_too_large", `Replay bodies are limited to ${MAX_REPLAY_BODY_BYTES} bytes.`);
  }
  const orgRl = await rateLimit(p.ex, `hp:replay:org:${ctx.orgId}`, limits.replayPerOrgPerMinute, 60_000, now);
  if (!orgRl.allowed) {
    return fail(429, "rate_limited", "Too many replays from this workspace. Try again shortly.", {
      retryAfterSeconds: Math.max(1, Math.ceil((orgRl.resetAt.getTime() - now.getTime()) / 1000)),
    });
  }
  const destRl = await rateLimit(p.ex, `hp:replay:dest:${dest.id}`, limits.replayPerDestinationPerMinute, 60_000, now);
  if (!destRl.allowed) {
    return fail(429, "rate_limited", "Too many replays to this destination. Try again shortly.", {
      retryAfterSeconds: Math.max(1, Math.ceil((destRl.resetAt.getTime() - now.getTime()) / 1000)),
    });
  }

  const plan = planReplayHeaders(raw.headers, input.includeSensitiveHeaders);
  const batchId = randomUUID();
  const { rows } = await p.ex.query<{ id: string }>(
    `INSERT INTO hp_replays (org_id, batch_id, endpoint_id, request_id, destination_id, destination_url, user_id,
       included_sensitive, attempt, attempts_total, status, run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 1, $9, 'running', $10) RETURNING id`,
    [ctx.orgId, batchId, ctx.endpoint.id, raw.id, dest.id, dest.url, ctx.userId, JSON.stringify(plan.includedSensitive), input.attempts, now.toISOString()],
  );
  const first = await deliverAttempt(p, rows[0]!.id);
  const { send, ...rest } = plan;
  return { ok: true, batchId, replays: first ? [first] : [], headers: { ...rest, sent: send.map(([k]) => k) } };
}

/** Sends one attempt (row must be 'running'), records the result, schedules the next retry if any. */
async function deliverAttempt(p: Platform, replayId: string): Promise<ReplayDTO | null> {
  const row = await loadReplay(p.ex, replayId);
  if (!row) return null;
  const finish = async (status: ReplayStatus, f: Partial<Record<string, unknown>>) => {
    await p.ex.query(
      `UPDATE hp_replays SET status = $2, response_status = $3, elapsed_ms = $4, error_code = $5, error = $6,
         response_headers = $7::jsonb, response_body_preview = $8, response_truncated = $9, finished_at = now()
       WHERE id = $1`,
      [
        replayId,
        status,
        f.responseStatus ?? null,
        f.elapsedMs ?? null,
        f.errorCode ?? null,
        f.error ?? null,
        f.responseHeaders ? JSON.stringify(f.responseHeaders) : null,
        f.preview ?? null,
        Boolean(f.truncated),
      ],
    );
  };

  const raw = row.request_id && row.endpoint_id ? await getRawRequest(p.ex, row.endpoint_id, row.request_id) : null;
  if (!raw) {
    await finish("skipped", { errorCode: "request_deleted", error: "The captured request no longer exists." });
    return toReplayDTO((await loadReplay(p.ex, replayId))!);
  }
  const check = checkDestinationUrl(p, row.destination_url);
  if (!check.ok) {
    await finish("blocked", { errorCode: check.code, error: check.message });
    return toReplayDTO((await loadReplay(p.ex, replayId))!);
  }
  const plan = planReplayHeaders(raw.headers, jsonList(row.included_sensitive));
  const headers: [string, string][] = [...plan.send, ["x-webhooktrail-replay-id", row.id]];
  const body = raw.method === "GET" || raw.body.byteLength === 0 ? undefined : raw.body;
  let status: ReplayStatus = "failed";
  try {
    const res = await safeDeliver(check.url, {
      method: raw.method as (typeof REPLAYABLE_METHODS)[number],
      headers,
      body,
      userAgent: "WebhookTrail-Replay/1.0",
      timeoutMs: REPLAY_TIMEOUT_MS,
      maxResponseBytes: REPLAY_RESPONSE_CAP,
      policy: p.replay.policy,
      resolver: p.replay.resolver,
    });
    status = res.status >= 200 && res.status < 300 ? "delivered" : "failed";
    const respHeaders = Object.fromEntries(Object.entries(res.headers).slice(0, 40));
    await finish(status, {
      responseStatus: res.status,
      elapsedMs: res.elapsedMs,
      responseHeaders: respHeaders,
      preview: res.body.subarray(0, PREVIEW_BYTES).toString("utf8"),
      truncated: res.truncated || res.body.byteLength > PREVIEW_BYTES,
      error: res.status >= 300 && res.status < 400 ? "Redirect returned; replays never follow redirects." : null,
    });
  } catch (err) {
    const e = err instanceof SafeFetchError ? err : null;
    status = e?.isBlocked ? "blocked" : "failed";
    await finish(status, { errorCode: e?.code ?? "NETWORK", error: (e?.message ?? "Delivery failed.").slice(0, 300) });
  }
  log.info("replay attempt", { replayId, orgId: row.org_id, attempt: row.attempt, status });

  if (status === "failed" && row.attempt < row.attempts_total) {
    const runAt = new Date(Date.now() + retryDelayMs(row.attempt));
    const { rows: next } = await p.ex.query<{ id: string }>(
      `INSERT INTO hp_replays (org_id, batch_id, endpoint_id, request_id, destination_id, destination_url, user_id,
         included_sensitive, attempt, attempts_total, status, run_at)
       SELECT org_id, batch_id, endpoint_id, request_id, destination_id, destination_url, user_id,
         included_sensitive, attempt + 1, attempts_total, 'scheduled', $2 FROM hp_replays WHERE id = $1
       RETURNING id`,
      [replayId, runAt.toISOString()],
    );
    await enqueueJob(p.ex, REPLAY_QUEUE, { replayId: next[0]!.id }, { runAt, maxAttempts: 1 });
  }
  return toReplayDTO((await loadReplay(p.ex, replayId))!);
}

/** Job handler for scheduled retry attempts. Re-checks plan, destination and verification first. */
export async function runScheduledReplay(p: Platform, replayId: string): Promise<void> {
  const { rows } = await p.ex.query<{ id: string; org_id: string; destination_id: string | null; destination_url: string }>(
    `UPDATE hp_replays SET status = 'running' WHERE id = $1 AND status = 'scheduled' RETURNING id, org_id, destination_id, destination_url`,
    [replayId],
  );
  const row = rows[0];
  if (!row) return; // already ran or cancelled: idempotent
  const skip = async (code: string, message: string) => {
    await p.ex.query(`UPDATE hp_replays SET status = 'skipped', error_code = $2, error = $3, finished_at = now() WHERE id = $1`, [
      replayId,
      code,
      message,
    ]);
  };
  const lim = await orgLimits(p, row.org_id);
  if (!lim.replay) return skip("plan_required", "The workspace's plan no longer includes replay.");
  const dest = row.destination_id ? await getDestination(p.ex, row.org_id, row.destination_id) : null;
  if (!dest) return skip("destination_deleted", "The destination was deleted.");
  if (!dest.verified_at || dest.url !== row.destination_url) {
    return skip("destination_not_verified", "The destination changed or is no longer verified.");
  }
  await deliverAttempt(p, replayId);
}
