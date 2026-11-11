import { getClientIp } from "@repo/ops";
import { CLIENT_IP_HEADER, getPlatform } from "./platform";

/**
 * /api/auth/* -> Better Auth. The client IP for Better Auth's rate limiter is resolved here with the
 * same TRUSTED_PROXY rules as every other limit and passed in a private header (client copies removed).
 */
export async function authRouteHandler(req: Request): Promise<Response> {
  const p = await getPlatform();
  const headers = new Headers(req.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = getClientIp(req.headers, p.clientIp);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const forwarded = new Request(req.url, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: "manual",
  });
  return p.auth.handler(forwarded);
}
