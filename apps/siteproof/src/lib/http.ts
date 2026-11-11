/** Small helpers shared by the app's route handlers (Web Request/Response only). */
import { isAuthError, type OrgRole } from "@repo/auth";
import { getPlatform, type Platform } from "./platform";
import { SiteError } from "./monitoring/sites";

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export const notFound = () => json(404, { error: "not_found", message: "Not found" });

/**
 * CSRF defence in depth for state-changing requests (SameSite=Lax cookies are the first layer):
 * an Origin header must equal APP_URL's origin; without Origin, Sec-Fetch-Site must not be cross-site.
 */
export function isSameOrigin(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (origin) return origin === new URL(appUrl).origin;
  const site = req.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

export async function readJsonBody<T = unknown>(req: Request, maxBytes = 8192): Promise<T | null> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) return null;
  if (Number(req.headers.get("content-length") ?? "0") > maxBytes) return null;
  const raw = await req.text();
  if (raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** SiteError by class or by shape (Next may bundle the module into several chunks). */
function asSiteError(err: unknown): { code: string; status: number; message: string } | null {
  if (err instanceof SiteError) return err;
  const e = err as { name?: unknown; code?: unknown; status?: unknown; message?: unknown } | null;
  if (e && e.name === "SiteError" && typeof e.code === "string" && typeof e.status === "number") {
    return { code: e.code, status: e.status, message: String(e.message ?? "") };
  }
  return null;
}

export interface OrgContext {
  p: Platform;
  org: { id: string; name: string; slug: string };
  user: { id: string; email: string; name: string };
  role: OrgRole;
}

/**
 * Wraps an org-scoped route: resolves the org from the session (never from the request), enforces the
 * role, same-origin for non-GET methods, and maps AuthError/SiteError to JSON responses.
 */
export function orgRoute<C>(
  fn: (req: Request, ctx: OrgContext, routeCtx: C) => Promise<Response>,
  opts: { role?: OrgRole } = {},
) {
  return async (req: Request, routeCtx: C): Promise<Response> => {
    const p = await getPlatform();
    if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req, p.env.APP_URL)) {
      return json(403, { error: "cross_origin", message: "Cross-origin requests are not allowed." });
    }
    try {
      const r = await p.auth.requireOrg(req.headers, { role: opts.role ?? "member" });
      const user = r.user as { id: string; email: string; name: string };
      return await fn(req, { p, org: r.org, user, role: r.role }, routeCtx);
    } catch (err) {
      const authRes = isAuthError(err) ? err.toResponse() : p.authErrorResponse(err);
      if (authRes) return authRes;
      const site = asSiteError(err);
      if (site) return json(site.status, { error: site.code, message: site.message });
      p.logger.error("route failed", { path: new URL(req.url).pathname, err });
      return json(500, { error: "internal_error", message: "Something went wrong. Please try again." });
    }
  };
}

/** Platform role check for /admin (auth_user.role operator|owner). Never derived from client input. */
export async function isOperator(p: Platform, headers: Headers): Promise<{ id: string; email: string } | null> {
  const s = await p.auth.getSession(headers);
  if (!s) return null;
  const { rows } = await p.handle.executor.query<{ role: string | null }>(`SELECT role FROM auth_user WHERE id = $1`, [s.user.id]);
  const role = rows[0]?.role;
  return role === "operator" || role === "owner" ? { id: s.user.id, email: s.user.email } : null;
}
