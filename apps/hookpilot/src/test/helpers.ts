import * as endpointsRoute from "@/app/api/endpoints/route";
import * as endpointRoute from "@/app/api/endpoints/[id]/route";
import * as requestsRoute from "@/app/api/endpoints/[id]/requests/route";
import * as requestRoute from "@/app/api/endpoints/[id]/requests/[requestId]/route";
import * as captureRoute from "@/app/h/[slug]/[[...path]]/route";
import { OWNER_COOKIE } from "@/lib/owner";
import type { EndpointDTO } from "@/lib/types";

export const ORIGIN = "http://localhost:3003";

let ipCounter = 0;
/** A fresh client IP per call so per-IP rate limits never couple unrelated tests. */
export function freshIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

interface ApiOpts {
  token?: string | null;
  body?: unknown;
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

export function apiRequest(method: string, path: string, opts: ApiOpts = {}): Request {
  const headers = new Headers(opts.headers);
  headers.set("x-forwarded-for", opts.ip ?? freshIp());
  if (opts.token) headers.set("cookie", `${OWNER_COOKIE}=${opts.token}`);
  if (opts.origin !== null && method !== "GET") headers.set("origin", opts.origin ?? ORIGIN);
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  return new Request(`${ORIGIN}${path}`, { method, headers, body });
}

export function tokenFromSetCookie(res: Response): string | null {
  const sc = res.headers.get("set-cookie");
  const m = sc ? new RegExp(`${OWNER_COOKIE}=([^;]+)`).exec(sc) : null;
  return m ? m[1]! : null;
}

export async function createEndpoint(token?: string | null, ip?: string): Promise<{ res: Response; token: string; endpoint: EndpointDTO }> {
  const res = await endpointsRoute.POST(apiRequest("POST", "/api/endpoints", { token, body: {}, ip }));
  const json = (await res.clone().json()) as { endpoint: EndpointDTO };
  return { res, token: tokenFromSetCookie(res) ?? token ?? "", endpoint: json.endpoint };
}

export function capture(slug: string, method: string, init: { path?: string; body?: BodyInit; headers?: Record<string, string>; ip?: string } = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("x-forwarded-for")) headers.set("x-forwarded-for", init.ip ?? freshIp());
  const req = new Request(`${ORIGIN}/h/${slug}${init.path ?? ""}`, {
    method,
    headers,
    body: init.body,
    // Node's fetch Request needs this for streaming bodies.
    ...(init.body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
  const handler = captureRoute[method as keyof typeof captureRoute] as (r: Request, c: unknown) => Promise<Response>;
  return handler(req, { params: Promise.resolve({ slug, path: [] }) });
}

const p = <T>(v: T) => ({ params: Promise.resolve(v) });

export const routes = {
  listEndpoints: (token?: string) => endpointsRoute.GET(apiRequest("GET", "/api/endpoints", { token })),
  getEndpoint: (id: string, token?: string) => endpointRoute.GET(apiRequest("GET", `/api/endpoints/${id}`, { token }), p({ id })),
  patchEndpoint: (id: string, token: string, body: unknown, origin?: string | null) =>
    endpointRoute.PATCH(apiRequest("PATCH", `/api/endpoints/${id}`, { token, body, origin }), p({ id })),
  deleteEndpoint: (id: string, token: string, origin?: string | null) =>
    endpointRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}`, { token, origin }), p({ id })),
  listRequests: (id: string, token: string, query = "") =>
    requestsRoute.GET(apiRequest("GET", `/api/endpoints/${id}/requests${query}`, { token }), p({ id })),
  clearRequests: (id: string, token: string) =>
    requestsRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}/requests`, { token }), p({ id })),
  getRequest: (id: string, requestId: string, token: string) =>
    requestRoute.GET(apiRequest("GET", `/api/endpoints/${id}/requests/${requestId}`, { token }), p({ id, requestId })),
  deleteRequest: (id: string, requestId: string, token: string) =>
    requestRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}/requests/${requestId}`, { token }), p({ id, requestId })),
};
