import { getClientIp } from "@repo/ops";
import { AUTH_IP_HEADER, getPlatform } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Better Auth routes. The client IP used for auth rate limiting is resolved here with the same
 * trusted-proxy rule as every other limit (TRUSTED_PROXY) and passed in a header Better Auth is
 * configured to read; any client-sent copy of that header is dropped.
 */
async function handler(req: Request): Promise<Response> {
  const p = await getPlatform();
  const headers = new Headers(req.headers);
  headers.delete(AUTH_IP_HEADER);
  const ip = getClientIp(req.headers, p.clientIp);
  if (ip) headers.set(AUTH_IP_HEADER, ip);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const forwarded = new Request(req.url, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    signal: req.signal,
  });
  return p.auth.handler(forwarded);
}

export const GET = handler;
export const POST = handler;
