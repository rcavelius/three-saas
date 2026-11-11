/**
 * safeDeliver: SSRF-safe outbound delivery for webhook REPLAY (WebhookTrail).
 *
 * Differences from safeFetch (which is read-only crawling):
 *  - allows POST/PUT/PATCH/DELETE/GET with a request body (capped), because replaying a webhook needs it;
 *  - NEVER follows redirects: a 3xx is returned as-is, so a target cannot bounce the request elsewhere
 *    (e.g. to a private address or another site) and replay cannot act as a crawling proxy;
 *  - forwards caller headers through a strict denylist (hop-by-hop, host, cookies, proxy and forwarding
 *    headers are stripped) with count/size caps and CRLF rejection;
 *  - response body capped small (default 64 KB, truncated) — replay shows the target's reply, it is not a
 *    general download facility.
 * DNS/IP validation and socket pinning are identical to safeFetch: public unicast only, ports 80/443 only,
 * connect to the exact validated IP. Callers must additionally restrict WHICH URLs a user may target
 * (WebhookTrail: verified destinations only) and rate-limit per account.
 */
import { Agent, request } from "undici";
import type { Readable } from "node:stream";
import { SafeFetchError } from "./errors";
import { assertKnownPolicy, type AddressPolicy } from "./policy";
import { resolvePinnedAddress, systemResolver, type Resolver } from "./resolve";
import { validateTargetUrl } from "./url";
import { flattenHeaders, mapError, pinnedLookup, readBody } from "./safe-fetch";

export const DELIVER_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type DeliverMethod = (typeof DELIVER_METHODS)[number];

export const MAX_DELIVER_BODY_BYTES = 1024 * 1024;
const MAX_HEADERS = 50;
const MAX_HEADER_VALUE = 8 * 1024;

/** Headers that are never forwarded, whatever the caller passes. */
const DENIED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-length",
  "expect",
  "cookie",
  "cookie2",
  "forwarded",
  "via",
  "x-real-ip",
  "true-client-ip",
  "cf-connecting-ip",
  "fly-client-ip",
  "accept-encoding",
]);
const DENIED_PREFIXES = ["proxy-", "x-forwarded-", "sec-", ":"];

export interface DeliverOptions {
  method: DeliverMethod;
  headers?: Array<[string, string]> | Record<string, string>;
  body?: Uint8Array | string;
  userAgent?: string;
  connectTimeoutMs?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
  resolver?: Resolver;
  policy?: AddressPolicy;
}

export interface DeliverResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  address: string;
  elapsedMs: number;
  /** Header names the caller passed that were dropped by the denylist. */
  droppedHeaders: string[];
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function sanitizeDeliverHeaders(input: DeliverOptions["headers"]): {
  headers: Record<string, string>;
  dropped: string[];
} {
  const entries: Array<[string, string]> = Array.isArray(input) ? input : Object.entries(input ?? {});
  if (entries.length > MAX_HEADERS) {
    throw new SafeFetchError("BLOCKED_HEADER", `At most ${MAX_HEADERS} headers may be forwarded`);
  }
  const headers: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [rawName, rawValue] of entries) {
    const name = String(rawName).trim().toLowerCase();
    const value = String(rawValue);
    if (!TOKEN.test(name)) throw new SafeFetchError("BLOCKED_HEADER", "Invalid header name");
    if (/[\r\n\0]/.test(value)) throw new SafeFetchError("BLOCKED_HEADER", `Invalid characters in header ${name}`);
    if (value.length > MAX_HEADER_VALUE) throw new SafeFetchError("BLOCKED_HEADER", `Header ${name} is too long`);
    if (DENIED_HEADERS.has(name) || DENIED_PREFIXES.some((p) => name.startsWith(p))) {
      dropped.push(name);
      continue;
    }
    headers[name] = headers[name] !== undefined ? `${headers[name]}, ${value}` : value;
  }
  return { headers, dropped };
}

export async function safeDeliver(input: string | URL, options: DeliverOptions): Promise<DeliverResult> {
  const policy = assertKnownPolicy(options.policy);
  if (!(DELIVER_METHODS as readonly string[]).includes(options.method)) {
    throw new SafeFetchError("BLOCKED_METHOD", `Method ${String(options.method)} is not allowed`);
  }
  const body =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? Buffer.from(options.body, "utf8")
        : Buffer.from(options.body);
  if (body && body.length > MAX_DELIVER_BODY_BYTES) {
    throw new SafeFetchError("BODY_TOO_LARGE", `Request body exceeds ${MAX_DELIVER_BODY_BYTES} bytes`);
  }
  if (body && body.length > 0 && options.method === "GET") {
    throw new SafeFetchError("BLOCKED_METHOD", "GET requests cannot carry a body");
  }
  const { headers, dropped } = sanitizeDeliverHeaders(options.headers);
  headers["user-agent"] = options.userAgent ?? headers["user-agent"] ?? "WebhookTrail-Replay/1.0";

  const resolver = options.resolver ?? systemResolver;
  const connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new SafeFetchError("TIMEOUT", "Request timed out")), timeoutMs);
  const signal = options.signal ? AbortSignal.any([deadline.signal, options.signal]) : deadline.signal;
  const started = Date.now();
  const target = validateTargetUrl(input, policy);

  try {
    const address = await resolvePinnedAddress(target, policy, resolver, Math.min(timeoutMs, connectTimeoutMs));
    const agent = new Agent({
      connect: { timeout: connectTimeoutMs, lookup: pinnedLookup(target.hostname, address), rejectUnauthorized: true },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connections: 1,
      pipelining: 1,
    });
    try {
      let res;
      try {
        res = await request(target.url, {
          method: options.method,
          headers,
          body,
          dispatcher: agent,
          signal,
          // undici's request() never follows redirects unless a redirect interceptor is installed.
        });
      } catch (err) {
        throw mapError(err, target.url.href, deadline.signal);
      }
      const resHeaders = flattenHeaders(res.headers as Record<string, string | string[] | undefined>);
      let resBody: Buffer = Buffer.alloc(0);
      let truncated = false;
      try {
        ({ body: resBody, truncated } = await readBody(
          res.body as unknown as Readable,
          resHeaders["content-encoding"],
          maxResponseBytes,
          "truncate",
          target.url.href,
        ));
      } catch (err) {
        throw mapError(err, target.url.href, deadline.signal);
      }
      // set-cookie from the target is never relayed to our users.
      delete resHeaders["set-cookie"];
      return {
        url: target.url.href,
        status: res.statusCode,
        headers: resHeaders,
        body: resBody,
        truncated,
        address,
        elapsedMs: Date.now() - started,
        droppedHeaders: dropped,
      };
    } finally {
      agent.destroy().catch(() => undefined);
    }
  } catch (err) {
    throw mapError(err, target.url.href, deadline.signal);
  } finally {
    clearTimeout(timer);
  }
}
