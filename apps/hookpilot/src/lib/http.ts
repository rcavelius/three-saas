import type { z } from "zod";
import { getClientIp, rateLimitKeyForIp, type ClientIpConfig } from "@repo/ops";
import { readSmallText } from "./body";

export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers?: HeadersInit): Response {
  return json({ error: { code, message, ...extra } }, { status, headers });
}

export const notFound = () => apiError(404, "not_found", "Endpoint or request not found.");

export function retryAfterSeconds(resetAt: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}

export function tooManyRequests(resetAt: Date, message = "Rate limit exceeded. Try again later."): Response {
  const secs = retryAfterSeconds(resetAt);
  return apiError(429, "rate_limited", message, { retryAfterSeconds: secs }, { "Retry-After": String(secs) });
}

/**
 * Client IP for rate limits and display: only the header the deployment's trusted proxy sets
 * (TRUSTED_PROXY, see @repo/ops getClientIp). Spoofed X-Forwarded-For / X-Real-IP are ignored.
 * `key` buckets IPv6 by /64; an unknown IP shares one bucket (never a free pass).
 */
export function clientIpOf(req: Request, cfg: ClientIpConfig): { ip: string | null; key: string } {
  const ip = getClientIp(req.headers, cfg);
  return { ip, key: rateLimitKeyForIp(ip) };
}

export function appOrigin(req: Request): string {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(req.url).origin;
}

/**
 * CSRF defence for state-changing API calls: the browser must send an Origin equal to ours and must
 * not label the request cross-site. JSON bodies are additionally required (see readJsonBody), which
 * HTML forms cannot produce without a CORS preflight that we never grant.
 */
export function checkOrigin(req: Request, expectedOrigin: string = appOrigin(req)): Response | null {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return apiError(403, "bad_origin", "Cross-site requests are not allowed.");
  }
  const origin = req.headers.get("origin");
  if (!origin || origin !== expectedOrigin) {
    return apiError(403, "bad_origin", "Missing or foreign Origin header.");
  }
  return null;
}

export async function readJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  maxBytes = 16 * 1024,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  const ct = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (ct !== "application/json") {
    return { ok: false, res: apiError(415, "unsupported_media_type", "Send a JSON body with Content-Type: application/json.") };
  }
  const text = await readSmallText(req, maxBytes);
  if (text === null) return { ok: false, res: apiError(413, "payload_too_large", "Request body too large.") };
  let raw: unknown;
  try {
    raw = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return { ok: false, res: apiError(400, "invalid_json", "Body is not valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      res: apiError(400, "validation_failed", "Invalid input.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

export function parseCookies(req: Request): Map<string, string> {
  const out = new Map<string, string>();
  const header = req.headers.get("cookie");
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k && !out.has(k)) out.set(k, v);
  }
  return out;
}
