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

/**
 * Where a visit came from, privacy-safe: the referrer is reduced to its host, UTM values are short fixed
 * tokens, the country is Cloudflare's two-letter code and the device a coarse class. No IP, no full URL,
 * no user agent string is ever stored.
 */
export interface VisitSource {
  referrerHost?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  country?: string | null;
  device?: "mobile" | "desktop" | null;
  isBot?: boolean;
  /** First pageview of a visit (page load not coming from our own site): the entry/landing page. */
  landing?: boolean;
}

export interface TrackInput {
  name: string;
  anonymousId?: string | null;
  userId?: string | null;
  path?: string | null;
  props?: Record<string, unknown> | null;
  source?: VisitSource | null;
}

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/;

/**
 * Full referrer URL -> host only ("https://www.google.com/search?q=x" -> "google.com"). Returns null for
 * empty, non-http(s), IP-address, malformed or self-referrals (any host in `ownHosts`).
 */
export function referrerHost(raw: unknown, ownHosts: readonly string[] = []): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    // Android apps send android-app://com.google.android.gm/ as the referrer.
    if (u.protocol === "android-app:" && HOST_RE.test(u.hostname.toLowerCase())) return `android-app:${u.hostname.toLowerCase()}`.slice(0, 100);
    return null;
  }
  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) return null;
  host = host.replace(/^www\.|^m\./, "");
  if (!HOST_RE.test(host) || host.length > 100) return null;
  const own = ownHosts.map((h) => h.toLowerCase().replace(/^www\./, ""));
  if (own.includes(host)) return null;
  return host;
}

/** utm_* value -> lowercase token of at most 64 chars from [a-z0-9._-+ ], or null. Never personal data. */
export function sanitizeUtm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase().slice(0, 64);
  if (!v || !/^[a-z0-9._+\- ]+$/.test(v) || looksPersonal(v)) return null;
  return v;
}

/** Cloudflare's CF-IPCountry header (two letters). "XX" (unknown) and "T1" (Tor) become null. */
export function countryFromHeaders(headers: Headers): string | null {
  const v = (headers.get("cf-ipcountry") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v) || v === "XX" || v === "T1") return null;
  return v;
}

const BOT_UA_RE =
  /bot\b|bot\/|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|chrome-lighthouse|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|skypeuripreview|curl\/|wget\/|python-|aiohttp|httpx|go-http-client|java\/|okhttp|node-fetch|undici|axios|libwww|phantomjs|puppeteer|playwright|selenium|cypress|httpclient|feedfetcher|validator|archive\.org|ia_archiver|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baiduspider|bingpreview|gptbot|claudebot|anthropic|perplexity|ccbot|bytespider|amazonbot|applebot/i;

/** An obvious crawler, monitor, link-preview fetcher or scripted client (or no user agent at all). */
export function isObviousBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT_UA_RE.test(userAgent);
}

/** Coarse device class from the user agent: phones and tablets are "mobile". */
export function deviceClass(userAgent: string | null | undefined): "mobile" | "desktop" | null {
  if (!userAgent) return null;
  return /Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|Opera Mini|IEMobile/i.test(userAgent) ? "mobile" : "desktop";
}

/**
 * Builds the VisitSource for one beacon: referrer + utm come from the client body (only the landing
 * pageview sends them), country/device/bot from the request headers.
 */
export function visitSourceFrom(
  headers: Headers,
  body: { referrer?: unknown; utm?: unknown; landing?: unknown },
  ownHosts: readonly string[] = [],
): VisitSource {
  const ua = headers.get("user-agent");
  const utm = body.utm && typeof body.utm === "object" && !Array.isArray(body.utm) ? (body.utm as Record<string, unknown>) : {};
  return {
    referrerHost: referrerHost(body.referrer, ownHosts),
    utmSource: sanitizeUtm(utm.source),
    utmMedium: sanitizeUtm(utm.medium),
    utmCampaign: sanitizeUtm(utm.campaign),
    country: countryFromHeaders(headers),
    device: deviceClass(ua),
    isBot: isObviousBot(ua),
    landing: body.landing === true,
  };
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
  const s = e.source ?? {};
  const device = s.device === "mobile" || s.device === "desktop" ? s.device : null;
  const country = typeof s.country === "string" && /^[A-Z]{2}$/.test(s.country) ? s.country : null;
  await ex.query(
    `INSERT INTO analytics_events (name, anonymous_id, user_id, path, props, created_at,
                                   referrer_host, utm_source, utm_medium, utm_campaign, country, device, is_bot, is_landing)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      e.name,
      sanitizeAnonId(e.anonymousId),
      typeof e.userId === "string" && e.userId.length <= 64 ? e.userId : null,
      sanitizePath(e.path),
      JSON.stringify(sanitizeProps(e.props)),
      (opts.now ?? new Date()).toISOString(),
      // Re-sanitized here so direct trackEvent callers cannot store a full URL or free text.
      s.referrerHost ? referrerHost(`https://${s.referrerHost}/`) ?? (s.referrerHost.startsWith("android-app:") ? s.referrerHost.slice(0, 100) : null) : null,
      sanitizeUtm(s.utmSource),
      sanitizeUtm(s.utmMedium),
      sanitizeUtm(s.utmCampaign),
      country,
      device,
      s.isBot === true,
      s.landing === true && e.name === "pageview",
    ],
  );
  return { stored: true };
}
