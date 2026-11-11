import { rateLimit, type SqlExecutor } from "@repo/database";
import { appLogger } from "./log";
import { readBodyCapped } from "./body";
import { getDb } from "./db";
import { clientIp, retryAfterSeconds } from "./http";
import { SLUG_RE } from "./ids";
import { OWNER_COOKIE } from "./owner";
import { limits, PLANS, type PlanId } from "./plans";
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

function captureError(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
  const h = captureResponseHeaders("application/json");
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(JSON.stringify({ ok: false, error: code, message }), { status, headers: h });
}

/** Path after /h/<slug>, kept exactly as sent (still percent-encoded). */
export function subpathFromUrl(url: URL, slug: string): string {
  const prefix = `/h/${slug}`;
  const p = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : "";
  return (p === "" ? "/" : p).slice(0, limits.storedPathMaxLength);
}

/** Headers as an ordered [name, value] list, without our own owner cookie, size-capped. */
export function headersForStorage(req: Request): [string, string][] {
  const out: [string, string][] = [];
  for (const [name, value] of req.headers) {
    if (out.length >= limits.storedHeaderCount) break;
    let v = value;
    if (name === "cookie") {
      v = value
        .split(";")
        .filter((part) => part.split("=")[0]?.trim() !== OWNER_COOKIE)
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
  plan: string;
  expires_at: Date | string;
  deleted_at: Date | string | null;
  max_requests: number;
  response_status: number;
  response_content_type: "application/json" | "text/plain";
  response_body: string | null;
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

export async function handleCapture(req: Request, slug: string, opts: { executor?: SqlExecutor } = {}): Promise<Response> {
  const method = req.method.toUpperCase();
  if (!METHODS.has(method)) return captureError(405, "method_not_allowed", "Method not supported.");
  if (!SLUG_RE.test(slug)) return captureError(404, "not_found", "No such endpoint.");

  const ex = opts.executor ?? (await getDb()).executor;
  const now = new Date();
  const ip = clientIp(req);

  const ipLimit = await rateLimit(ex, `hp:cap:ip:${ip}`, limits.capturePerIpPerMinute, 60_000, now);
  if (!ipLimit.allowed) {
    return captureError(429, "rate_limited", "Too many requests from this IP.", {
      "Retry-After": String(retryAfterSeconds(ipLimit.resetAt, now)),
    });
  }

  const { rows } = await ex.query<CaptureEndpointRow>(
    `SELECT id, plan, expires_at, deleted_at, max_requests, response_status, response_content_type, response_body
     FROM endpoints WHERE slug = $1`,
    [slug],
  );
  const ep = rows[0];
  if (!ep || ep.deleted_at) return captureError(404, "not_found", "No such endpoint.");
  if (new Date(ep.expires_at).getTime() <= now.getTime()) {
    return captureError(410, "expired", "This endpoint has expired.");
  }

  const plan = PLANS[(ep.plan in PLANS ? ep.plan : "free") as PlanId];
  const epLimit = await rateLimit(ex, `hp:cap:ep:${ep.id}`, plan.capturePerEndpointPerMinute, 60_000, now);
  if (!epLimit.allowed) {
    return captureError(429, "rate_limited", "Too many requests to this endpoint.", {
      "Retry-After": String(retryAfterSeconds(epLimit.resetAt, now)),
    });
  }

  const body = await readBodyCapped(req, plan.storedBodyBytes, plan.maxBodyBytes);
  if (body.kind === "too_large") {
    log.info("capture rejected: payload too large", { endpointId: ep.id, method, size: body.size });
    return captureError(413, "payload_too_large", `Body exceeds ${plan.maxBodyBytes} bytes.`);
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
    maxRequests: ep.max_requests,
  });
  // Never log headers, query or body: they routinely carry secrets.
  log.info("captured", { endpointId: ep.id, method, size: body.size, truncated: body.truncated });
  return buildCaptureResponse(ep, requestId, method, req);
}
