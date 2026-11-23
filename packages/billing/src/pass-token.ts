/**
 * Pass cookie values: "<checkout session id>.<base64url HMAC-SHA256(secret, 'pass-v1:' + id)>".
 * The HMAC keeps forged or guessed ids from even reaching the database; the database row (paid, not expired,
 * not refunded) is still what grants access.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function mac(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`pass-v1:${id}`).digest("base64url");
}

export function signPassToken(sessionId: string, secret: string): string {
  return `${sessionId}.${mac(sessionId, secret)}`;
}

/** The session id when the token's signature is valid, else null. */
export function verifyPassToken(token: string, secret: string): string | null {
  if (typeof token !== "string" || token.length > 400) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(id, secret));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return id;
}

/** Value of one cookie from a Cookie header (first match), or null. */
export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const v = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}
