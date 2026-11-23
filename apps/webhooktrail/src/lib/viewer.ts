/**
 * Who is calling: a signed-in member of an organization (session cookie, org = the session's
 * active organization, membership verified in the database by auth.requireOrg) and/or an
 * anonymous owner (wt_owner cookie). The org id NEVER comes from the request body or query.
 */
import { isAuthError, type OrgRole } from "@repo/auth";
import { sha256Hex } from "./ids";
import { readOwnerToken } from "./owner";
import type { Platform } from "./platform";

export interface Viewer {
  user: { id: string; email: string; name: string; role: string } | null;
  org: { id: string; name: string; role: OrgRole } | null;
  /** sha256 of the anonymous owner token cookie, if present. */
  anonHash: string | null;
  /** Checkout Session ids of the one-time pass cookie (signature verified; billing decides if still active). */
  passIds: string[];
}

export async function getViewer(p: Platform, req: Request): Promise<Viewer> {
  const token = readOwnerToken(req);
  const anonHash = token ? sha256Hex(token) : null;
  // Only consult auth when a session cookie could be present (capture/anon traffic stays cheap).
  const cookie = req.headers.get("cookie") ?? "";
  const passIds = p.billing.passIdsFromCookieHeader(cookie || null);
  if (!/wt\.session_token=/.test(cookie)) return { user: null, org: null, anonHash, passIds };
  try {
    const r = await p.auth.requireOrg(req.headers);
    const u = r.user as { id: string; email: string; name: string; role?: string };
    return {
      user: { id: u.id, email: u.email, name: u.name, role: u.role ?? "customer" },
      org: { id: r.org.id, name: r.org.name, role: r.role },
      anonHash,
      passIds,
    };
  } catch (err) {
    if (!isAuthError(err)) throw err;
    if (err.status === 404) {
      // Signed in but no (visible) active organization.
      const s = await p.auth.getSession(req.headers);
      if (s) {
        const u = s.user as { id: string; email: string; name: string; role?: string };
        return { user: { id: u.id, email: u.email, name: u.name, role: u.role ?? "customer" }, org: null, anonHash, passIds };
      }
    }
    return { user: null, org: null, anonHash, passIds };
  }
}

export const canManage = (role: OrgRole | null | undefined) => role === "owner" || role === "admin";
