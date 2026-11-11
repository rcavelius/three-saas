/** Small HTTP helpers shared by the API route handlers (Web Request/Response only). */
import { isAuthError } from "@repo/auth";
import { BillingError } from "@repo/billing";
import { rateLimit } from "@repo/database";
import { getClientIp, rateLimitKeyForIp, type ClientIpConfig } from "@repo/ops";
import type { SqlExecutor } from "@repo/database";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/** Maps thrown errors to responses. Unknown errors become a generic 500 (details only in the server log). */
export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return json(e.status, { error: e.code, message: e.message }, e.headers);
  if (isAuthError(e)) return e.toResponse();
  if (e instanceof BillingError) return json(e.status, { error: e.code, message: e.status < 500 ? e.message : "Billing is not configured." });
  console.error("[datapolish] unhandled API error", e instanceof Error ? `${e.name}: ${e.message}` : e);
  return json(500, { error: "internal_error", message: "Something went wrong." });
}

export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return errorResponse(e);
  }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: state-changing requests must come from our
 * own origin (Origin header), or — when a browser omits Origin — be marked same-origin by Fetch Metadata.
 */
export function assertSameOrigin(req: Request, appUrl: string): void {
  if (!UNSAFE.has(req.method.toUpperCase())) return;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== new URL(appUrl).origin) throw new ApiError(403, "cross_origin", "Cross-origin request refused.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site !== "same-origin") throw new ApiError(403, "cross_origin", "Cross-origin request refused.");
}

/** Reads a JSON body with a hard byte cap (the stream is cancelled beyond it). */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const ct = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (ct !== "application/json") throw new ApiError(415, "unsupported_media_type", "Send JSON.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "too_large", "Request body too large.");
  if (!req.body) throw new ApiError(400, "invalid_body", "Empty body.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ApiError(413, "too_large", "Request body too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json", "Body is not valid JSON.");
  }
}

/** Per-client-IP fixed-window limit. The IP comes only from the configured trusted proxy header. */
export async function limitByIp(
  ex: SqlExecutor,
  clientIp: ClientIpConfig,
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<void> {
  const ip = getClientIp(req.headers, clientIp);
  const rl = await rateLimit(ex, `${bucket}:${rateLimitKeyForIp(ip)}`, limit, windowMs, now);
  if (!rl.allowed) {
    const retry = Math.max(1, Math.ceil((rl.resetAt.getTime() - now.getTime()) / 1000));
    throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", { "retry-after": String(retry) });
  }
}

/** Per-account limit (in addition to the IP limit) so one user cannot hammer from many addresses. */
export async function limitByKey(ex: SqlExecutor, key: string, limit: number, windowMs: number, now = new Date()): Promise<void> {
  const rl = await rateLimit(ex, key, limit, windowMs, now);
  if (!rl.allowed) {
    const retry = Math.max(1, Math.ceil((rl.resetAt.getTime() - now.getTime()) / 1000));
    throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", { "retry-after": String(retry) });
  }
}
