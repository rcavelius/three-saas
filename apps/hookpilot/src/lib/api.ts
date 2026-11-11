import { rateLimit, type SqlExecutor } from "@repo/database";
import { getDb } from "./db";
import { getOwnedEndpoint, type EndpointRow } from "./endpoints";
import { apiError, checkOrigin, clientIp, notFound, tooManyRequests } from "./http";
import { UUID_RE } from "./ids";
import { getOwner, type Owner } from "./owner";
import { limits } from "./plans";

export interface ApiContext {
  ex: SqlExecutor;
  owner: Owner | null;
  ip: string;
}

/** Common entry for /api routes: per-IP rate limit, Origin check on mutations, owner lookup. */
export async function apiContext(req: Request, opts: { mutating: boolean }): Promise<ApiContext | Response> {
  if (opts.mutating) {
    const bad = checkOrigin(req);
    if (bad) return bad;
  }
  const { executor: ex } = await getDb();
  const ip = clientIp(req);
  const rl = await rateLimit(ex, `hp:api:ip:${ip}`, limits.apiPerIpPerMinute, 60_000);
  if (!rl.allowed) return tooManyRequests(rl.resetAt);
  return { ex, owner: getOwner(req), ip };
}

export type OwnedEndpointContext = ApiContext & { owner: Owner; endpoint: EndpointRow };

/**
 * Resolves an endpoint the caller owns. Not owned, deleted, malformed id, no cookie: all 404, so
 * the API never confirms that someone else's endpoint exists. Expired (but not yet cleaned up)
 * endpoints answer 410 to their owner unless `allowExpired` (used for DELETE).
 */
export async function ownedEndpointContext(
  req: Request,
  id: string,
  opts: { mutating: boolean; allowExpired?: boolean },
): Promise<OwnedEndpointContext | Response> {
  const ctx = await apiContext(req, opts);
  if (ctx instanceof Response) return ctx;
  if (!ctx.owner || !UUID_RE.test(id)) return notFound();
  const endpoint = await getOwnedEndpoint(ctx.ex, ctx.owner, id);
  if (!endpoint) return notFound();
  if (!opts.allowExpired && new Date(endpoint.expires_at).getTime() <= Date.now()) {
    return apiError(410, "expired", "This endpoint has expired and will be deleted shortly.");
  }
  return { ...ctx, owner: ctx.owner, endpoint };
}
