import { newOwnerToken, OWNER_TOKEN_RE } from "./ids";
import { parseCookies } from "./http";
import { limits } from "./plans";

/**
 * Anonymous ownership: a random 256-bit token in an httpOnly cookie scoped to /api (so it is never
 * sent to capture URLs under /h/). Only its sha256 is stored. After sign-up/login the endpoints of
 * this token can be claimed into the user's organization (POST /api/endpoints/claim).
 */
export const OWNER_COOKIE = "wt_owner";

export function readOwnerToken(req: Request): string | null {
  const v = parseCookies(req).get(OWNER_COOKIE);
  return v && OWNER_TOKEN_RE.test(v) ? v : null;
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
