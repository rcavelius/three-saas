import { rateLimit } from "@repo/database";
import { appLogger } from "./log";
import { readBodyCapped } from "./body";
import { clientIpOf, retryAfterSeconds } from "./http";
import { SLUG_RE } from "./ids";
import { maybeNotifyUsage } from "./notify";
import { orgLimits } from "./org-data";
import { OWNER_COOKIE } from "./owner";
import { limits } from "./plans";
import { getPlatform, type Platform } from "./platform";
import { insertCapturedRequest } from "./requests";
import { CAPTURE_METHODS } from "./types";

const log = appLogger("capture");
const METHODS = new Set<string>(CAPTURE_METHODS);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * Headers on every capture response. Users choose the response body, so it is only ever served as
 * text/plain or application/json, never sniffed, and sandboxed if a browser renders it anyway.
 */
export function captureResponseHeaders(contentType: "application/json" | "text/plain"): Headers {
  const h = new Headers();
  h.set("Content-Type", `${contentType}; charset=utf-8`);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Content-Security-Policy", "sandbox; default-src 'none'; frame-ancestors 'none'");
  h.set("Cache-Control", "no-store");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Expose-Headers", "X-HookPilot-Request-Id");
  return h;
}

function captureError(
  status: number,
  code: string,
  message: string,
  extraHeaders: Record<string, string> = {},
  extraBody: Record<string, unknown> = {},
): Response {
  const h = captureResponseHeaders("application/json");
  for (const [k, v] of Object.entries(extraHeaders)) h.set(k, v);
  return new Response(JSON.stringify({ ok: false, error: code, message, ...extraBody }), { status, headers: h });
}

/** Path after /h/<slug>, kept exactly as sent (still percent-encoded). */
export function subpathFromUrl(url: URL, slug: string): string {
  const prefix = `/h/${slug}`;
  const p = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  return (p === "" ? "/" : p).slice(0, limits.storedPathMaxLength);
}

/** HookPilot's own cookies (anonymous owner token, Better Auth session/cookies with the "hp" prefix). */
export function isOwnCookie(name: string): boolean {
  const n = name.trim();
  return n === OWNER_COOKIE || /^(__Secure-|__Host-)?hp\./.test(n);
}

/** Headers as an ordered [name, value] list, without HookPilot's own cookies, size-capped. */
export function headersForStorage(req: Request): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, value] of req.headers) {
    if (out.length >= limits.storedHeaderCount) break;
    let v = value;
    if (name === "cookie") {
      v = value
        .split(";")
        .filter((part) => !isOwnCookie(part.split("=")[0] ?? ""))
        .join(";")
        .trim();
      if (!v) continue;
    }
    out.push([name, v.slice(0, limits.storedHeaderValueMaxLength)]);
  }
  return out;
}

interface CaptureEndpointRow {
  id: string;
  org_id: string | null;
  anon_owner_hash: string | null;
  expires_at: Date | string | null;
  locked_at: Date | string | null;
  deleted_at: Date | string | null;
  response_status: number;
  response_content_type: "application/json" | "text/plain";
  response_body: string | null;
}

/** First day of next UTC month (when the monthly quota resets). */
export function nextPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function buildCaptureResponse(ep: CaptureEndpointRow, requestId: string, method: string, req: Request): Response {
  const headers = captureResponseHeaders(ep.response_content_type);
  headers.set("X-HookPilot-Request-Id", requestId);
  if (method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", CAPTURE_METHODS.join(", "));
    const asked = req.headers.get("access-control-request-headers");
    if (asked && /^[A-Za-z0-9\-_, ]{1,1024}$/.test(asked)) headers.set("Access-Control-Allow-Headers", asked);
    headers.set("Access-Control-Max-Age", "600");
  }
  const status = ep.response_status;
  if (method === "HEAD" || NULL_BODY_STATUSES.has(status)) return new Response(null, { status, headers });
  const body = ep.response_body ?? JSON.stringify({ ok: true, id: requestId });
  return new Response(body, { status, headers });
}

/** Usage key for the monthly quota: the org, or the anonymous owner (free plan quota per owner token). */
export function usageOwnerKey(ep: { org_id: string | null; anon_owner_hash: string | null }): string {
  return ep.org_id ?? `anon:${ep.anon_owner_hash}`;
}

/**
 * Public capture: no auth, never reveals stored data (it only answers with the endpoint's
 * configured response). Order: method/slug → per-IP limit → endpoint state → per-endpoint limit →
 * body (plan payload caps, 413) → monthly quota (atomic consumeUsage, 429) → store + prune.
 */
export async function handleCapture(req: Request, slug: string, opts: { platform?: Platform } = {}): Promise<Response> {
  const method = req.method.toUpperCase();
  if (!METHODS.has(method)) return captureError(405, "method_not_allowed", "Method not supported.");
  if (!SLUG_RE.test(slug)) return captureError(404, "not_found", "No such endpoint.");

  const p = opts.platform ?? (await getPlatform());
  const ex = p.ex;
  const now = new Date();
  const { ip, key: ipKey } = clientIpOf(req, p.clientIp);

  const ipLimit = await rateLimit(ex, `hp:cap:${ipKey}`, limits.capturePerIpPerMinute, 60_000, now);
  if (!ipLimit.allowed) {
    return captureError(429, "rate_limited", "Too many requests from this IP.", {
      "Retry-After": String(retryAfterSeconds(ipLimit.resetAt, now)),
    });
  }

  const { rows } = await ex.query<CaptureEndpointRow>(
    `SELECT id, org_id, anon_owner_hash, expires_at, locked_at, deleted_at, response_status, response_content_type, response_body
     FROM endpoints WHERE slug = $1`,
    [slug],
  );
  const ep = rows[0];
  if (!ep || ep.deleted_at) return captureError(404, "not_found", "No such endpoint.");
  if (ep.expires_at !== null && new Date(ep.expires_at).getTime() <= now.getTime()) {
    return captureError(410, "expired", "This endpoint has expired.");
  }
  if (ep.locked_at !== null) {
    return captureError(423, "endpoint_paused", "This endpoint is paused because the workspace's plan does not include it. Nothing was stored.");
  }

  const plan = await orgLimits(p, ep.org_id);
  const epLimit = await rateLimit(ex, `hp:cap:ep:${ep.id}`, plan.capturePerEndpointPerMinute, 60_000, now);
  if (!epLimit.allowed) {
    return captureError(429, "rate_limited", "Too many requests to this endpoint.", {
      "Retry-After": String(retryAfterSeconds(epLimit.resetAt, now)),
    });
  }

  const body = await readBodyCapped(req, plan.storedBodyBytes, plan.maxBodyBytes);
  if (body.kind === "too_large") {
    log.info("capture rejected: payload too large", { endpointId: ep.id, method, size: body.size });
    return captureError(413, "payload_too_large", `Body exceeds the ${plan.planName} plan's ${plan.maxBodyBytes} byte limit.`, {}, {
      limitBytes: plan.maxBodyBytes,
    });
  }

  // Monthly quota: one atomic check-and-increment (never exceeds the limit under concurrency).
  const owner = usageOwnerKey(ep);
  const period = p.billing.currentPeriod();
  const usage = await p.billing.consumeUsage(owner, "requestsPerMonth", 1, { period });
  if (!usage.ok) {
    const resets = nextPeriodStart(now);
    log.info("capture rejected: monthly quota exhausted", { endpointId: ep.id });
    return captureError(
      429,
      "quota_exceeded",
      `Monthly request quota exhausted (${usage.limit} captured requests per month on the ${plan.planName} plan). Captures resume on ${resets.toISOString().slice(0, 10)} (UTC) or right after an upgrade.`,
      { "Retry-After": String(retryAfterSeconds(resets, now)) },
      { limit: usage.limit, used: usage.used, period, resetsAt: resets.toISOString() },
    );
  }

  const url = new URL(req.url);
  const requestId = await insertCapturedRequest(ex, {
    endpointId: ep.id,
    method,
    path: subpathFromUrl(url, slug),
    query: url.search.replace(/^\?/, "").slice(0, limits.storedQueryMaxLength),
    headers: headersForStorage(req),
    body: body.body,
    bodySize: body.size,
    truncated: body.truncated,
    contentType: req.headers.get("content-type")?.slice(0, 255) ?? null,
    sourceIp: ip,
    maxRequests: plan.requestsStored,
  });
  await maybeNotifyUsage(p, owner, "requestsPerMonth", usage.used, usage.limit, period);
  // Never log headers, query or body: they routinely carry secrets.
  log.info("captured", { endpointId: ep.id, method, size: body.size, truncated: body.truncated });
  return buildCaptureResponse(ep, requestId, method, req);
}
