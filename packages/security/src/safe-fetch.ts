/**
 * SSRF-safe HTTP client.
 *
 *  - every hop: validateTargetUrl (scheme/port/credentials/hostname/IP literal) -> resolve ALL addresses -> reject
 *    if any is non-public -> connect to that exact validated IP (undici connect.lookup is pinned), while the URL
 *    keeps the hostname so Host header, SNI and certificate verification still use the real name (no rebinding
 *    window between check and connect).
 *  - redirects are followed manually (max 5), each one re-validated from scratch; cookies/auth are never sent.
 *  - connect timeout, total deadline (covers all hops and the body), max body bytes enforced while streaming
 *    (after decompression, so gzip bombs are capped too). Only GET and HEAD.
 */
import { Agent, request } from "undici";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { LookupFunction } from "node:net";
import { SafeFetchError } from "./errors";
import { ipFamily } from "./ip";
import { assertKnownPolicy, type AddressPolicy } from "./policy";
import { resolvePinnedAddress, systemResolver, type Resolver } from "./resolve";
import { validateTargetUrl } from "./url";

export const DEFAULT_USER_AGENT = "SiteProofBot/1.0";
export const MAX_REDIRECTS_CAP = 5;

/** Request headers callers may set. Everything else (cookie, authorization, host, proxy-*) is dropped. */
const ALLOWED_REQUEST_HEADERS = new Set(["accept", "accept-language", "cache-control", "if-none-match", "if-modified-since"]);

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Full User-Agent string, e.g. "SiteProofBot/1.0 (+https://siteproof.example/bot)". */
  userAgent?: string;
  /** Follow redirects (default true). When false the 3xx response itself is returned. */
  followRedirects?: boolean;
  /** Max redirect hops, capped at 5. */
  maxRedirects?: number;
  connectTimeoutMs?: number;
  /** Total deadline for DNS + connect + all hops + body. */
  timeoutMs?: number;
  maxBodyBytes?: number;
  /** "error" (default) throws BODY_TOO_LARGE; "truncate" returns the first maxBodyBytes with truncated=true. */
  onOversize?: "error" | "truncate";
  signal?: AbortSignal;
  /** Injected DNS resolver (tests). Defaults to the OS resolver. */
  resolver?: Resolver;
  /** Address policy. Defaults to public-only; only built-in policy objects are accepted. */
  policy?: AddressPolicy;
}

export interface RedirectHop {
  url: string;
  status: number;
  location: string;
}

export interface SafeResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  redirects: RedirectHop[];
  /** The IP address the final response came from. */
  address: string;
  elapsedMs: number;
  text(): string;
}

export function pinnedLookup(hostname: string, address: string): LookupFunction {
  const family = ipFamily(address);
  return ((host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    if (host.replace(/^\[|\]$/g, "").toLowerCase() !== hostname.toLowerCase()) {
      cb(new SafeFetchError("BLOCKED_HOST", "Unexpected hostname in pinned lookup"));
      return;
    }
    if (opts && opts.all) cb(null, [{ address, family }]);
    else cb(null, address, family);
  }) as unknown as LookupFunction;
}

export function flattenHeaders(h: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

export async function readBody(
  body: Readable,
  encoding: string | undefined,
  maxBytes: number,
  onOversize: "error" | "truncate",
  url: string,
): Promise<{ body: Buffer; truncated: boolean }> {
  let stream: Readable = body;
  const enc = (encoding ?? "").trim().toLowerCase();
  if (enc === "gzip" || enc === "x-gzip" || enc === "deflate" || enc === "br") {
    const decoder = enc === "br" ? createBrotliDecompress() : enc === "deflate" ? createInflate() : createGunzip();
    body.on("error", (e) => decoder.destroy(e));
    body.pipe(decoder);
    stream = decoder;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      if (size + buf.length > maxBytes) {
        if (onOversize === "truncate") {
          chunks.push(buf.subarray(0, maxBytes - size));
          size = maxBytes;
          body.destroy();
          stream.destroy();
          return { body: Buffer.concat(chunks, size), truncated: true };
        }
        body.destroy();
        stream.destroy();
        throw new SafeFetchError("BODY_TOO_LARGE", `Response body exceeds ${maxBytes} bytes`, { url });
      }
      chunks.push(buf);
      size += buf.length;
    }
  }
  return { body: Buffer.concat(chunks, size), truncated: false };
}

export function mapError(err: unknown, url: string, deadline: AbortSignal): SafeFetchError {
  if (err instanceof SafeFetchError) return err;
  const e = err as { name?: string; code?: string; message?: string };
  if (deadline.aborted || e?.name === "AbortError" || e?.code === "UND_ERR_CONNECT_TIMEOUT" || e?.code === "UND_ERR_HEADERS_TIMEOUT" || e?.code === "UND_ERR_BODY_TIMEOUT") {
    return new SafeFetchError("TIMEOUT", "Request timed out", { url, cause: err });
  }
  const code = e?.code ?? "";
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO|ERR_TLS|HOSTNAME_MISMATCH|ERR_SSL/i.test(code) || /certificate/i.test(e?.message ?? "")) {
    return new SafeFetchError("TLS_ERROR", `TLS error: ${code || e?.message}`, { url, cause: err });
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new SafeFetchError("DNS_FAILURE", "DNS lookup failed", { url, cause: err });
  }
  return new SafeFetchError("NETWORK", `Network error: ${code || e?.message || "unknown"}`, { url, cause: err });
}

export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const policy = assertKnownPolicy(options.policy);
  const method = options.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    throw new SafeFetchError("BLOCKED_METHOD", `Method ${String(method)} is not allowed`);
  }
  const resolver = options.resolver ?? systemResolver;
  const maxRedirects = Math.min(Math.max(0, options.maxRedirects ?? MAX_REDIRECTS_CAP), MAX_REDIRECTS_CAP);
  const followRedirects = options.followRedirects ?? true;
  const connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBodyBytes = options.maxBodyBytes ?? 2 * 1024 * 1024;
  const onOversize = options.onOversize ?? "error";

  const headers: Record<string, string> = {
    "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-encoding": "gzip, deflate, br",
  };
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    const key = k.toLowerCase();
    if (ALLOWED_REQUEST_HEADERS.has(key) && !/[\r\n]/.test(v)) headers[key] = v;
  }

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new SafeFetchError("TIMEOUT", "Request timed out")), timeoutMs);
  const signal = options.signal ? AbortSignal.any([deadline.signal, options.signal]) : deadline.signal;
  const started = Date.now();
  const redirects: RedirectHop[] = [];
  let currentMethod = method;
  let target = validateTargetUrl(input, policy);

  try {
    for (;;) {
      if (signal.aborted) throw new SafeFetchError("TIMEOUT", "Request timed out", { url: target.url.href });
      const remaining = Math.max(1, timeoutMs - (Date.now() - started));
      const address = await resolvePinnedAddress(target, policy, resolver, Math.min(remaining, connectTimeoutMs));
      const agent = new Agent({
        connect: {
          timeout: connectTimeoutMs,
          lookup: pinnedLookup(target.hostname, address),
          rejectUnauthorized: true,
        },
        headersTimeout: remaining,
        bodyTimeout: remaining,
        connections: 1,
        pipelining: 1,
      });
      try {
        let res;
        try {
          res = await request(target.url, {
            method: currentMethod,
            headers,
            dispatcher: agent,
            signal,
          });
        } catch (err) {
          throw mapError(err, target.url.href, deadline.signal);
        }
        const resHeaders = flattenHeaders(res.headers as Record<string, string | string[] | undefined>);
        const location = resHeaders["location"];
        const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode) && Boolean(location);

        if (isRedirect && followRedirects) {
          await res.body.dump({ limit: 64 * 1024 }).catch(() => undefined);
          if (redirects.length >= maxRedirects) {
            throw new SafeFetchError("TOO_MANY_REDIRECTS", `More than ${maxRedirects} redirects`, { url: target.url.href });
          }
          // Validate the Location as written (absolute or protocol-relative), so obfuscated IP spellings are
          // caught before WHATWG URL normalises them; relative paths are resolved against the current URL.
          const loc = location!.trim();
          let nextRaw: string;
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(loc)) nextRaw = loc;
          else if (loc.startsWith("//")) nextRaw = target.url.protocol + loc;
          else {
            try {
              nextRaw = new URL(loc, target.url).href;
            } catch {
              throw new SafeFetchError("INVALID_URL", "Redirect Location is not a valid URL", { url: target.url.href });
            }
          }
          redirects.push({ url: target.url.href, status: res.statusCode, location: nextRaw });
          target = validateTargetUrl(nextRaw, policy);
          if (res.statusCode === 303 && currentMethod !== "HEAD") currentMethod = "GET";
          continue;
        }

        let body: Buffer = Buffer.alloc(0);
        let truncated = false;
        if (currentMethod === "HEAD") {
          await res.body.dump().catch(() => undefined);
        } else {
          try {
            ({ body, truncated } = await readBody(
              res.body as unknown as Readable,
              resHeaders["content-encoding"],
              maxBodyBytes,
              onOversize,
              target.url.href,
            ));
          } catch (err) {
            throw mapError(err, target.url.href, deadline.signal);
          }
        }
        return {
          url: target.url.href,
          status: res.statusCode,
          headers: resHeaders,
          body,
          truncated,
          redirects,
          address,
          elapsedMs: Date.now() - started,
          text: () => body.toString("utf8"),
        };
      } finally {
        agent.destroy().catch(() => undefined);
      }
    }
  } catch (err) {
    throw mapError(err, target.url.href, deadline.signal);
  } finally {
    clearTimeout(timer);
  }
}
