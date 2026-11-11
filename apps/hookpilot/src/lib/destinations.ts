/**
 * Replay destinations: the ONLY URLs a replay can target. A destination must be verified by a
 * challenge round-trip before it can receive replays (like Slack's url_verification), and changing
 * its URL clears the verification.
 *
 * Verification protocol: HookPilot POSTs `{"type":"hookpilot.verify","challenge":"<random>"}`
 * (Content-Type: application/json) with @repo/security safeDeliver (public IPs only, ports 80/443,
 * no redirects followed). The destination must answer 2xx with the challenge echoed in the body:
 * either the bare challenge string or JSON `{"challenge":"<challenge>"}`.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { checkTargetUrl, SafeFetchError, safeDeliver } from "@repo/security";
import type { SqlExecutor } from "@repo/database";
import { sha256Hex } from "./ids";
import type { Platform } from "./platform";
import type { DestinationDTO } from "./types";

export interface DestinationRow {
  id: string;
  org_id: string;
  name: string;
  url: string;
  verified_at: Date | string | null;
  verification_attempted_at: Date | string | null;
  last_verification_error: string | null;
  created_at: Date | string;
}

const COLS = `id, org_id, name, url, verified_at, verification_attempted_at, last_verification_error, created_at`;
const iso = (d: Date | string | null) => (d === null ? null : (d instanceof Date ? d : new Date(d)).toISOString());

export function toDestinationDTO(r: DestinationRow): DestinationDTO {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    verified: r.verified_at !== null,
    verifiedAt: iso(r.verified_at),
    verificationAttemptedAt: iso(r.verification_attempted_at),
    lastVerificationError: r.last_verification_error,
    createdAt: iso(r.created_at)!,
  };
}

/**
 * True when `host` is HookPilot itself (APP_URL host, configured extra hosts, or any subdomain of
 * them). Replay and verification never target our own host: that would let a replay re-enter the
 * capture or API surface with a user's headers.
 */
export function isSelfHost(host: string, selfHosts: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  return selfHosts.some((s) => {
    const x = s.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
    return x !== "" && (h === x || h.endsWith(`.${x}`));
  });
}

export type UrlCheck = { ok: true; url: string } | { ok: false; code: string; message: string };

/** Static checks for a destination URL (scheme, port, credentials, IP literal, special-use names, self host). DNS is checked at send time. */
export function checkDestinationUrl(p: Pick<Platform, "replay">, input: string): UrlCheck {
  const r = checkTargetUrl(input, p.replay.policy);
  if (!r.ok) return { ok: false, code: r.code, message: r.message };
  if (isSelfHost(r.url.hostname, p.replay.selfHosts)) {
    return { ok: false, code: "BLOCKED_SELF", message: "Replays cannot target HookPilot itself." };
  }
  return { ok: true, url: r.url.href };
}

export async function listDestinations(ex: SqlExecutor, orgId: string): Promise<DestinationRow[]> {
  const { rows } = await ex.query<DestinationRow>(`SELECT ${COLS} FROM hp_destinations WHERE org_id = $1 ORDER BY created_at ASC`, [orgId]);
  return rows;
}

/** Org-scoped lookup: another org's destination id is simply not found. */
export async function getDestination(ex: SqlExecutor, orgId: string, id: string): Promise<DestinationRow | null> {
  const { rows } = await ex.query<DestinationRow>(`SELECT ${COLS} FROM hp_destinations WHERE org_id = $1 AND id = $2`, [orgId, id]);
  return rows[0] ?? null;
}

const VERIFY_TIMEOUT_MS = 10_000;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Did the destination echo the challenge? Accepts the bare string or {"challenge": "..."}. */
export function challengeEchoed(body: string, challenge: string): boolean {
  const t = body.trim();
  if (sameSecret(t, challenge)) return true;
  try {
    const j = JSON.parse(t) as unknown;
    if (j && typeof j === "object" && typeof (j as { challenge?: unknown }).challenge === "string") {
      return sameSecret((j as { challenge: string }).challenge, challenge);
    }
  } catch {
    /* not JSON */
  }
  return false;
}

export interface VerifyOutcome {
  verified: boolean;
  error: string | null;
  status: number | null;
}

/** Runs the challenge round-trip and records the outcome. */
export async function verifyDestination(p: Platform, dest: DestinationRow, now = new Date()): Promise<VerifyOutcome> {
  const challenge = randomBytes(24).toString("base64url");
  const url = dest.url;
  await p.ex.query(
    `UPDATE hp_destinations SET verification_token_hash = $3, verification_attempted_at = $4 WHERE id = $1 AND org_id = $2`,
    [dest.id, dest.org_id, sha256Hex(challenge), now.toISOString()],
  );
  let outcome: VerifyOutcome;
  const check = checkDestinationUrl(p, url);
  if (!check.ok) {
    outcome = { verified: false, error: `${check.code}: ${check.message}`, status: null };
  } else {
    try {
      const res = await safeDeliver(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/plain" },
        body: JSON.stringify({ type: "hookpilot.verify", challenge }),
        userAgent: "HookPilot-Verify/1.0",
        timeoutMs: VERIFY_TIMEOUT_MS,
        maxResponseBytes: 4096,
        policy: p.replay.policy,
        resolver: p.replay.resolver,
      });
      if (res.status >= 300 && res.status < 400) {
        outcome = { verified: false, error: `Destination answered ${res.status} (redirects are not followed).`, status: res.status };
      } else if (res.status < 200 || res.status >= 300) {
        outcome = { verified: false, error: `Destination answered ${res.status}; expected 2xx.`, status: res.status };
      } else if (!challengeEchoed(res.body.toString("utf8"), challenge)) {
        outcome = { verified: false, error: "The response body did not echo the challenge.", status: res.status };
      } else {
        outcome = { verified: true, error: null, status: res.status };
      }
    } catch (err) {
      const msg = err instanceof SafeFetchError ? `${err.code}: ${err.message}` : "Delivery failed.";
      outcome = { verified: false, error: msg.slice(0, 300), status: null };
    }
  }
  // Only mark verified if the URL is still the one we challenged (a concurrent edit resets it).
  await p.ex.query(
    `UPDATE hp_destinations SET verified_at = $4, last_verification_error = $5, updated_at = $6
     WHERE id = $1 AND org_id = $2 AND url = $3`,
    [dest.id, dest.org_id, url, outcome.verified ? now.toISOString() : null, outcome.error, now.toISOString()],
  );
  return outcome;
}
