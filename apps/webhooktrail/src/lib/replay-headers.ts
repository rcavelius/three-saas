/**
 * Which captured headers a replay sends. Pure and shared by the server (what is actually sent)
 * and the replay form (preview), so the preview can never disagree with the delivery.
 *
 * - sensitive (Authorization, Cookie, *-Token, *-Api-Key, *-Secret...): EXCLUDED unless the user
 *   ticks that header for this replay;
 * - signature/timestamp headers (Stripe-Signature, X-Hub-Signature-256, Svix-*...): included, with
 *   a warning that the signed timestamp is probably stale so the receiver may reject it;
 * - blocked: hop-by-hop, Host, Content-Length, forwarding/proxy headers and cookies are never
 *   forwarded (mirrors @repo/security safeDeliver's denylist, which enforces it again).
 */
const SENSITIVE_EXACT = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "cookie2",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-access-token",
  "x-refresh-token",
  "x-session-id",
]);
const SENSITIVE_PATTERN = /(^|-)(token|api-?key|secret|password|passwd|session|credentials?)$/i;

const SIGNATURE_PATTERN = /(signature|-sig$|hmac)/i;
const SIGNATURE_EXACT = new Set([
  "x-slack-request-timestamp",
  "svix-id",
  "svix-timestamp",
  "webhook-id",
  "webhook-timestamp",
  "x-twilio-signature",
  "x-shopify-hmac-sha256",
]);

const BLOCKED_EXACT = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-length",
  "expect",
  "cookie",
  "cookie2",
  "forwarded",
  "via",
  "x-real-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "fly-client-ip",
  "accept-encoding",
  "user-agent",
]);
const BLOCKED_PREFIXES = ["proxy-", "x-forwarded-", "sec-", ":", "x-webhooktrail-", "cf-", "fly-", "x-vercel-"];

export type ReplayHeaderKind = "blocked" | "sensitive" | "signature" | "normal";

export function classifyReplayHeader(rawName: string): ReplayHeaderKind {
  const name = rawName.trim().toLowerCase();
  if (BLOCKED_EXACT.has(name) || BLOCKED_PREFIXES.some((p) => name.startsWith(p))) return "blocked";
  if (SENSITIVE_EXACT.has(name) || SENSITIVE_PATTERN.test(name)) return "sensitive";
  if (SIGNATURE_EXACT.has(name) || SIGNATURE_PATTERN.test(name)) return "signature";
  return "normal";
}

export interface ReplayHeaderPlan {
  /** Headers that will be sent, in captured order. */
  send: [string, string][];
  /** Sensitive header names left out (not ticked). */
  excludedSensitive: string[];
  /** Sensitive header names included because the user ticked them. */
  includedSensitive: string[];
  /** Header names never forwarded. */
  blocked: string[];
  /** Signature/timestamp headers that are sent but probably stale. */
  signatureWarnings: string[];
}

export function planReplayHeaders(headers: ReadonlyArray<readonly [string, string]>, includeSensitive: readonly string[]): ReplayHeaderPlan {
  const ticked = new Set(includeSensitive.map((h) => h.trim().toLowerCase()));
  const plan: ReplayHeaderPlan = { send: [], excludedSensitive: [], includedSensitive: [], blocked: [], signatureWarnings: [] };
  const seen = (list: string[], n: string) => {
    if (!list.includes(n)) list.push(n);
  };
  for (const [rawName, value] of headers) {
    const name = rawName.trim().toLowerCase();
    const kind = classifyReplayHeader(name);
    if (kind === "blocked") {
      seen(plan.blocked, name);
      continue;
    }
    if (kind === "sensitive" && !ticked.has(name)) {
      seen(plan.excludedSensitive, name);
      continue;
    }
    if (/[\r\n\0]/.test(value)) {
      seen(plan.blocked, name);
      continue;
    }
    if (kind === "sensitive") seen(plan.includedSensitive, name);
    if (kind === "signature") seen(plan.signatureWarnings, name);
    plan.send.push([name, value]);
  }
  return plan;
}

/** Methods that can be replayed (safeDeliver's DELIVER_METHODS). */
export const REPLAYABLE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const MAX_REPLAY_BODY_BYTES = 1024 * 1024;
