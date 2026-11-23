/**
 * Next.js 16 helpers: CSP + security headers for proxy.ts, cron/health/events route factories.
 * Route factories use the standard Request/Response so they also work in plain Node handlers.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { rateLimit as dbRateLimit, type DbHandle } from "@repo/database";
import { DEFAULT_EVENT_NAMES, trackEvent, visitSourceFrom } from "./analytics";
import { getClientIp, rateLimitKeyForIp, type ClientIpConfig } from "./client-ip";
import { healthReport, publicHealth, type HealthOptions } from "./health";
import type { Scheduler } from "./scheduler";
import { systemClock, type Clock } from "./types";

export { buildCsp, cspProxy, securityHeaders, generateNonce, CSP_PROXY_MATCHER, type CspOptions } from "./csp";

// ------------------------------------------------------------------------------------------------

export const MIN_CRON_SECRET_LENGTH = 16;

/** Constant-time `Authorization: Bearer <secret>` check. False when the secret is unset or short. */
export function verifyCronRequest(req: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const m = /^Bearer ([^\s]+)$/i.exec(header);
  if (!m) return false;
  // Compare fixed-length digests so neither length nor content leaks through timing.
  const a = createHash("sha256").update(m[1]!).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

const noStore = { "Cache-Control": "no-store" };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...noStore },
  });
}

/** POST/GET /api/cron/tick. 503 when CRON_SECRET is not configured, 401 on a bad token. */
export function cronTickRoute(o: { scheduler: Scheduler; secret: string | undefined; budgetMs?: number }) {
  return async (req: Request): Promise<Response> => {
    if (!o.secret || o.secret.length < MIN_CRON_SECRET_LENGTH) {
      return json(503, { error: "cron_disabled", message: "CRON_SECRET is not configured." });
    }
    if (!verifyCronRequest(req, o.secret)) return json(401, { error: "unauthorized" });
    const report = await o.scheduler.tick({ budgetMs: o.budgetMs ?? 50_000 });
    return json(200, {
      ok: report.errors.length === 0,
      enqueued: report.enqueued.length,
      ran: report.ran,
      succeeded: report.succeeded,
      retried: report.retried,
      deadLettered: report.deadLettered.length,
      budgetExhausted: report.budgetExhausted,
      durationMs: report.durationMs,
    });
  };
}

/**
 * GET /api/health. Anonymous callers get `{ status, version }` only. With
 * `Authorization: Bearer <detailsSecret>` the full report is returned. 503 when down.
 */
export function healthRoute(o: {
  handle: Pick<DbHandle<any>, "executor">;
  version: string;
  detailsSecret?: string;
  now?: Clock;
  options?: Omit<HealthOptions, "now" | "version">;
}) {
  return async (req: Request): Promise<Response> => {
    const report = await healthReport(o.handle, { ...o.options, version: o.version, now: (o.now ?? systemClock)() });
    const code = report.status === "down" ? 503 : 200;
    if (o.detailsSecret && verifyCronRequest(req, o.detailsSecret)) return json(code, report);
    return json(code, publicHealth(report));
  };
}

// ------------------------------------------------------------------------------------------------
// Analytics beacon endpoint
// ------------------------------------------------------------------------------------------------

export const MAX_EVENT_BODY_BYTES = 4096;

export interface EventsRouteOptions {
  handle: Pick<DbHandle<any>, "executor">;
  rateLimit: { limit: number; windowMs: number };
  clientIp: ClientIpConfig;
  allowedNames?: readonly string[];
  /** Accepted Origin values (e.g. [APP_URL origin]). Default: the request URL's own origin. */
  allowedOrigins?: string[];
  /** Server-side user lookup (session). The client body can never set userId. */
  getUserId?: (req: Request) => Promise<string | null>;
  /** Per-event allowlist of prop keys, e.g. { tool_used: ["rows", "steps"] }. Events not listed keep sanitized props. */
  allowedProps?: Record<string, readonly string[]>;
  now?: Clock;
}

function isSameOrigin(req: Request, allowed: string[] | undefined): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin === "null") return false;
    const list = allowed && allowed.length ? allowed.map((o) => new URL(o).origin) : [new URL(req.url).origin];
    return list.includes(origin);
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/** Reads at most `max` bytes of the body; null (and the stream cancelled) if it is larger. */
async function readBounded(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** POST /api/events — client beacons (fetch keepalive or navigator.sendBeacon). Always 204 on accept. */
/**
 * Without an allowlist for the event, props pass through trackEvent's PII stripping only. With one, only the
 * listed keys are kept and only primitive values (string <= 64 chars, finite number, boolean).
 */
function pickProps(raw: unknown, allowed: readonly string[] | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!allowed) return raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of allowed) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 64)) {
      out[k] = v;
    }
  }
  return out;
}

export function eventsRoute(o: EventsRouteOptions) {
  const names = o.allowedNames ?? DEFAULT_EVENT_NAMES;
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!isSameOrigin(req, o.allowedOrigins)) return json(403, { error: "cross_origin" });
    const ct = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (ct !== "application/json" && ct !== "text/plain") return json(415, { error: "unsupported_media_type" });
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_EVENT_BODY_BYTES) return json(413, { error: "too_large" });

    const now = (o.now ?? systemClock)();
    const ip = getClientIp(req.headers, o.clientIp);
    const rl = await dbRateLimit(o.handle.executor, `events:${rateLimitKeyForIp(ip)}`, o.rateLimit.limit, o.rateLimit.windowMs, now);
    if (!rl.allowed) {
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt.getTime() - now.getTime()) / 1000))), ...noStore },
      });
    }

    const raw = await readBounded(req, MAX_EVENT_BODY_BYTES);
    if (raw === null) return json(413, { error: "too_large" });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_body" });
    const b = body as Record<string, unknown>;
    if (typeof b.name !== "string" || !names.includes(b.name)) return json(400, { error: "event_not_allowed" });
    const userId = o.getUserId ? await o.getUserId(req) : null;
    const ownHosts = [new URL(req.url).hostname, (req.headers.get("x-forwarded-host") ?? "").split(":")[0]!, ...(o.allowedOrigins ?? []).map((x) => new URL(x).hostname)].filter(
      Boolean,
    );
    await trackEvent(
      o.handle.executor,
      {
        name: b.name,
        anonymousId: typeof b.anonymousId === "string" ? b.anonymousId : null,
        userId,
        path: typeof b.path === "string" ? b.path : null,
        props: pickProps(b.props, o.allowedProps?.[b.name as string]),
        source: visitSourceFrom(req.headers, { referrer: b.referrer, utm: b.utm, landing: b.landing }, ownHosts),
      },
      { allowedNames: names, now },
    );
    return new Response(null, { status: 204, headers: noStore });
  };
}
