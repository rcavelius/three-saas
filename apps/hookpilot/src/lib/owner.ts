import { newOwnerToken, OWNER_TOKEN_RE, sha256Hex } from "./ids";
import { parseCookies } from "./http";
import { limits } from "./plans";

/**
 * Anonymous ownership: a random 256-bit token in an httpOnly cookie scoped to /api (so it is never
 * sent to capture URLs under /h/). Only its sha256 is stored. Accounts (userId) come later; the
 * Owner shape already carries both so queries check whichever is present.
 */
export const OWNER_COOKIE = "hp_owner";

export interface Owner {
  anonHash: string | null;
  userId: string | null;
}

export function readOwnerToken(req: Request): string | null {
  const v = parseCookies(req).get(OWNER_COOKIE);
  return v && OWNER_TOKEN_RE.test(v) ? v : null;
}

export function getOwner(req: Request): Owner | null {
  const token = readOwnerToken(req);
  if (!token) return null;
  return { anonHash: sha256Hex(token), userId: null };
}

/** Returns the existing owner token or mints a new one (the caller must then set the cookie). */
export function ensureOwnerToken(req: Request): { token: string; isNew: boolean } {
  const existing = readOwnerToken(req);
  if (existing) return { token: existing, isNew: false };
  return { token: newOwnerToken(), isNew: true };
}

export function ownerCookieHeader(token: string): string {
  const parts = [
    `${OWNER_COOKIE}=${token}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${limits.ownerCookieMaxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
