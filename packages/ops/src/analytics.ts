/**
 * First-party, cookie-less product analytics into CORE's analytics_events table.
 * Only allow-listed event names are stored; props are capped and scrubbed of anything that looks like
 * personal data (emails, IP addresses, PII-named keys). IP addresses are never stored.
 */
import { isIP } from "node:net";
import type { SqlExecutor } from "./types";

export const DEFAULT_EVENT_NAMES = [
  "pageview",
  "signup_started",
  "signup_completed",
  "checkout_started",
  "checkout_completed",
  "tool_used",
  "upgrade_clicked",
  "pricing_viewed",
  "cta_clicked",
] as const;

export interface TrackInput {
  name: string;
  anonymousId?: string | null;
  userId?: string | null;
  path?: string | null;
  props?: Record<string, unknown> | null;
}

export const MAX_PROPS = 20;
export const MAX_PROPS_BYTES = 2048;
const MAX_STRING = 200;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const IPV4_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const IPV6_RE = /\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/i;
const PII_KEY_RE = /(e-?mail|^ip$|ip_?addr|phone|password|passwd|token|secret|address|ssn|card|^name$|first_?name|last_?name)/i;

function looksPersonal(s: string): boolean {
  if (EMAIL_RE.test(s)) return true;
  if (isIP(s.trim())) return true;
  if (IPV4_RE.test(s)) return true;
  const m = IPV6_RE.exec(s);
  if (m && m[0].includes("::")) return true;
  if (m && m[0].split(":").length >= 4) return true;
  return false;
}

export function sanitizeProps(props: Record<string, unknown> | null | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!props || typeof props !== "object" || Array.isArray(props)) return out;
  let count = 0;
  for (const [k, v] of Object.entries(props)) {
    if (count >= MAX_PROPS) break;
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k) || PII_KEY_RE.test(k)) continue;
    let value: string | number | boolean | null;
    if (v === null || typeof v === "boolean") value = v;
    else if (typeof v === "number") {
      if (!Number.isFinite(v)) continue;
      value = v;
    } else if (typeof v === "string") {
      if (looksPersonal(v)) continue;
      value = v.slice(0, MAX_STRING);
    } else continue; // nested objects/arrays are dropped
    const candidate = { ...out, [k]: value };
    if (Buffer.byteLength(JSON.stringify(candidate)) > MAX_PROPS_BYTES) break;
    out[k] = value;
    count++;
  }
  return out;
}

/** Keeps only the pathname (query strings and fragments often carry tokens or emails). */
export function sanitizePath(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  let p: string;
  try {
    p = new URL(path, "http://x.invalid").pathname;
  } catch {
    return null;
  }
  if (!p.startsWith("/")) return null;
  const parts = p.split("/").map((seg) => {
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      /* keep raw */
    }
    return looksPersonal(decoded) ? ":redacted" : seg;
  });
  return parts.join("/").slice(0, 200);
}

function sanitizeAnonId(id: string | null | undefined): string | null {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
}

export async function trackEvent(
  ex: SqlExecutor,
  e: TrackInput,
  opts: { allowedNames?: readonly string[]; now?: Date } = {},
): Promise<{ stored: boolean; reason?: string }> {
  const allowed = opts.allowedNames ?? DEFAULT_EVENT_NAMES;
  if (typeof e.name !== "string" || !allowed.includes(e.name)) return { stored: false, reason: "name_not_allowed" };
  await ex.query(
    `INSERT INTO analytics_events (name, anonymous_id, user_id, path, props, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      e.name,
      sanitizeAnonId(e.anonymousId),
      typeof e.userId === "string" && e.userId.length <= 64 ? e.userId : null,
      sanitizePath(e.path),
      JSON.stringify(sanitizeProps(e.props)),
      (opts.now ?? new Date()).toISOString(),
    ],
  );
  return { stored: true };
}
