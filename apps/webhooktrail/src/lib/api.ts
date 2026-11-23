import { rateLimit, type SqlExecutor } from "@repo/database";
import { getVisibleEndpoint, isExpired, type EndpointRow } from "./endpoints";
import { apiError, checkOrigin, clientIpOf, notFound, tooManyRequests } from "./http";
import { UUID_RE } from "./ids";
import { endpointOwnerLimits } from "./org-data";
import { linkViewerPasses } from "./pass";
import { limits, type PlanLimits } from "./plans";
import { getPlatform, type Platform } from "./platform";
import { canManage, getViewer, type Viewer } from "./viewer";

export interface ApiContext {
  p: Platform;
  ex: SqlExecutor;
  viewer: Viewer;
  ip: { ip: string | null; key: string };
}

/** Common entry for /api routes: Origin check on mutations, per-IP rate limit, viewer (session/anon) lookup. */
export async function apiContext(req: Request, opts: { mutating: boolean }): Promise<ApiContext | Response> {
  const p = await getPlatform();
  if (opts.mutating) {
    const bad = checkOrigin(req, p.appUrl);
    if (bad) return bad;
  }
  const ip = clientIpOf(req, p.clientIp);
  const rl = await rateLimit(p.ex, `hp:api:${ip.key}`, limits.apiPerIpPerMinute, 60_000);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);
  const viewer = await getViewer(p, req);
  // A pass cookie links the pass to this viewer's workspace / anonymous owner (capture-side limits, jobs).
  await linkViewerPasses(p, viewer);
  return { p, ex: p.ex, viewer, ip };
}

/** Like apiContext but requires a signed-in member of an organization (401 otherwise). */
export async function orgContext(
  req: Request,
  opts: { mutating: boolean; manage?: boolean },
): Promise<(ApiContext & { org: NonNullable<Viewer["org"]>; user: NonNullable<Viewer["user"]> }) | Response> {
  const ctx = await apiContext(req, opts);
  if (ctx instanceof Response) return ctx;
  if (!ctx.viewer.user) return apiError(401, "unauthenticated", "Sign in required.");
  if (!ctx.viewer.org) return apiError(404, "no_organization", "No active workspace.");
  if (opts.manage && !canManage(ctx.viewer.org.role)) {
    return apiError(403, "insufficient_role", "Only workspace owners and admins can do this.");
  }
  return { ...ctx, org: ctx.viewer.org, user: ctx.viewer.user };
}

export type OwnedEndpointContext = ApiContext & { endpoint: EndpointRow; limits: PlanLimits };

/**
 * Resolves an endpoint the caller may see. Not visible, deleted, malformed id, no cookie/session:
 * all 404, so the API never confirms that someone else's endpoint exists. Expired (but not yet
 * cleaned up) endpoints answer 410 unless `allowExpired`. `manage` = owner/admin role required for
 * org endpoints (anonymous endpoints are managed by their cookie holder).
 */
export async function ownedEndpointContext(
  req: Request,
  id: string,
  opts: { mutating: boolean; allowExpired?: boolean; manage?: boolean },
): Promise<OwnedEndpointContext | Response> {
  const ctx = await apiContext(req, opts);
  if (ctx instanceof Response) return ctx;
  if ((!ctx.viewer.org && !ctx.viewer.anonHash) || !UUID_RE.test(id)) return notFound();
  const endpoint = await getVisibleEndpoint(ctx.ex, ctx.viewer, id);
  if (!endpoint) return notFound();
  if (!opts.allowExpired && isExpired(endpoint)) {
    return apiError(410, "expired", "This endpoint has expired and will be deleted shortly.");
  }
  if (opts.manage && endpoint.org_id !== null && !canManage(ctx.viewer.org?.role)) {
    return apiError(403, "insufficient_role", "Only workspace owners and admins can do this.");
  }
  const owner = endpoint.org_id ? { org_id: endpoint.org_id } : { org_id: null, anon_owner_hash: ctx.viewer.anonHash };
  return { ...ctx, endpoint, limits: await endpointOwnerLimits(ctx.p, owner, ctx.viewer.passIds) };
}
