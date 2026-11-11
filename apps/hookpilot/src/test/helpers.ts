import * as authRoute from "@/app/api/auth/[...all]/route";
import * as endpointsRoute from "@/app/api/endpoints/route";
import * as endpointRoute from "@/app/api/endpoints/[id]/route";
import * as requestsRoute from "@/app/api/endpoints/[id]/requests/route";
import * as requestRoute from "@/app/api/endpoints/[id]/requests/[requestId]/route";
import * as captureRoute from "@/app/h/[slug]/[[...path]]/route";
import { OWNER_COOKIE } from "@/lib/owner";
import { getPlatform } from "@/lib/platform";
import type { EndpointDTO } from "@/lib/types";

export const ORIGIN = "http://localhost:3003";
export const PASSWORD = "correct horse battery staple";

let ipCounter = 0;
/** A fresh client IP per call so per-IP rate limits never couple unrelated tests. */
export function freshIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

/** Cookie jar: name -> value. */
export type Jar = Map<string, string>;

export function absorb(jar: Jar, res: Response): void {
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(";");
    const idx = pair!.indexOf("=");
    const name = pair!.slice(0, idx).trim();
    const value = pair!.slice(idx + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === "";
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
}

interface ApiOpts {
  /** Anonymous owner token (hp_owner cookie). */
  token?: string | null;
  /** Session cookie jar (signed-in user). */
  jar?: Jar;
  body?: unknown;
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

export function apiRequest(method: string, path: string, opts: ApiOpts = {}): Request {
  const headers = new Headers(opts.headers);
  if (!headers.has("fly-client-ip")) headers.set("fly-client-ip", opts.ip ?? freshIp());
  const cookies: string[] = [];
  if (opts.jar) for (const [k, v] of opts.jar) cookies.push(`${k}=${v}`);
  if (opts.token) cookies.push(`${OWNER_COOKIE}=${opts.token}`);
  if (cookies.length) headers.set("cookie", cookies.join("; "));
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

export async function createEndpoint(
  token?: string | null,
  ip?: string,
  jar?: Jar,
): Promise<{ res: Response; token: string; endpoint: EndpointDTO }> {
  const res = await endpointsRoute.POST(apiRequest("POST", "/api/endpoints", { token, body: {}, ip, jar }));
  const json = (await res.clone().json()) as { endpoint: EndpointDTO };
  return { res, token: tokenFromSetCookie(res) ?? token ?? "", endpoint: json.endpoint };
}

export function capture(
  slug: string,
  method: string,
  init: { path?: string; body?: BodyInit; headers?: Record<string, string>; ip?: string } = {},
) {
  const headers = new Headers(init.headers);
  if (!headers.has("fly-client-ip")) headers.set("fly-client-ip", init.ip ?? freshIp());
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

type Who = string | { token?: string | null; jar?: Jar };
const who = (w: Who | undefined): { token?: string | null; jar?: Jar } => (typeof w === "string" || w === undefined ? { token: w } : w);

export const routes = {
  listEndpoints: (w?: Who) => endpointsRoute.GET(apiRequest("GET", "/api/endpoints", who(w))),
  getEndpoint: (id: string, w?: Who) => endpointRoute.GET(apiRequest("GET", `/api/endpoints/${id}`, who(w)), p({ id })),
  patchEndpoint: (id: string, w: Who, body: unknown, origin?: string | null) =>
    endpointRoute.PATCH(apiRequest("PATCH", `/api/endpoints/${id}`, { ...who(w), body, origin }), p({ id })),
  deleteEndpoint: (id: string, w: Who, origin?: string | null) =>
    endpointRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}`, { ...who(w), origin }), p({ id })),
  listRequests: (id: string, w: Who, query = "", headers?: Record<string, string>) =>
    requestsRoute.GET(apiRequest("GET", `/api/endpoints/${id}/requests${query}`, { ...who(w), headers }), p({ id })),
  clearRequests: (id: string, w: Who) => requestsRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}/requests`, who(w)), p({ id })),
  getRequest: (id: string, requestId: string, w: Who) =>
    requestRoute.GET(apiRequest("GET", `/api/endpoints/${id}/requests/${requestId}`, who(w)), p({ id, requestId })),
  deleteRequest: (id: string, requestId: string, w: Who) =>
    requestRoute.DELETE(apiRequest("DELETE", `/api/endpoints/${id}/requests/${requestId}`, who(w)), p({ id, requestId })),
};

// ---------------------------------------------------------------------------------------------
// Accounts through the app's own /api/auth route

export async function authCall(
  path: string,
  o: { body?: unknown; jar?: Jar; method?: string; ip?: string; origin?: string | null } = {},
): Promise<Response> {
  const headers = new Headers({ "fly-client-ip": o.ip ?? freshIp() });
  if (o.origin !== null) headers.set("origin", o.origin ?? ORIGIN);
  if (o.jar && o.jar.size) headers.set("cookie", [...o.jar].map(([k, v]) => `${k}=${v}`).join("; "));
  let body: string | undefined;
  if (o.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(o.body);
  }
  const url = path.startsWith("http") ? path : `${ORIGIN}/api/auth${path}`;
  const method = o.method ?? (body ? "POST" : "GET");
  const handler = method === "GET" ? authRoute.GET : authRoute.POST;
  const res = await handler(new Request(url, { method, headers, body }));
  if (o.jar) absorb(o.jar, res);
  return res;
}

/** Latest outbox email to `to` with `tag`, and the first link in it matching `pathPart`. */
export async function linkFromOutbox(to: string, tag: string, pathPart: string): Promise<string> {
  const pl = await getPlatform();
  const { rows } = await pl.ex.query<{ text_body: string }>(
    `SELECT text_body FROM ops_email_outbox WHERE to_address = $1 AND tag = $2 ORDER BY created_at DESC LIMIT 1`,
    [to, tag],
  );
  const text = rows[0]?.text_body;
  if (!text) throw new Error(`no ${tag} email to ${to}`);
  const m = text.match(/https?:\/\/[^\s<>"]+/g)?.find((u) => u.includes(pathPart));
  if (!m) throw new Error(`no ${pathPart} link in ${tag} email`);
  return m;
}

export interface TestUser {
  jar: Jar;
  email: string;
  userId: string;
  orgId: string;
}

/** Signs up through /api/auth, follows the verification link from the outbox (auto sign-in). */
export async function signUpVerified(email: string, name = "Test User"): Promise<TestUser> {
  const r = await authCall("/sign-up/email", { body: { email, password: PASSWORD, name } });
  if (r.status !== 200) throw new Error(`sign-up failed ${r.status} ${await r.text()}`);
  const link = await linkFromOutbox(email, "auth.verify-email", "/api/auth/verify-email");
  const jar: Jar = new Map();
  const v = await authCall(link, { jar, origin: null });
  if (v.status >= 400) throw new Error(`verify failed ${v.status}`);
  const pl = await getPlatform();
  const s = await pl.auth.getSession(new Headers({ cookie: [...jar].map(([k, v2]) => `${k}=${v2}`).join("; ") }));
  if (!s) throw new Error("no session after verification");
  const orgId = (s.session as { activeOrganizationId?: string }).activeOrganizationId;
  if (!orgId) throw new Error("no active org");
  return { jar, email, userId: s.user.id, orgId };
}

let userSeq = 0;
export function uniqueEmail(prefix = "user"): string {
  userSeq++;
  return `${prefix}${userSeq}.${Date.now().toString(36)}@example.com`;
}
