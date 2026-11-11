import { getPlatform } from "./platform";

/**
 * /api/auth/* -> Better Auth. The client IP for Better Auth's rate limiter is resolved by createAuth's
 * `resolveClientIp` (TRUSTED_PROXY rules; any client-sent copy is overwritten).
 */
export async function authRouteHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  return p.auth.handler(req);
}
