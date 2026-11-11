/**
 * Content Security Policy + security headers for Next.js proxy.ts. Dependency-free on purpose (no database,
 * no node:* modules): on Netlify the proxy runs as an Edge Function (Deno) and must not pull in server code.
 */
import { NextResponse, type NextRequest } from "next/server";

// ------------------------------------------------------------------------------------------------
// Content Security Policy
// ------------------------------------------------------------------------------------------------

export interface CspOptions {
  /** Extra connect-src origins (e.g. "https://api.stripe.com"). */
  connectSrc?: string[];
  /** Extra img-src origins. 'self', data: and blob: are always allowed. */
  imgSrc?: string[];
  /** Extra frame-src origins (e.g. "https://js.stripe.com"). Default: none. */
  frameSrc?: string[];
  /** frame-ancestors sources; default 'none' (no framing at all). */
  frameAncestors?: string[];
  /** Development mode: adds 'unsafe-eval' (React dev tooling needs it) and drops upgrade-insecure-requests. */
  dev?: boolean;
  /**
   * Add `upgrade-insecure-requests` (default: true unless dev). Set false when a production build is served
   * over plain http (e.g. `next start` on http://localhost for local smoke tests).
   */
  upgradeInsecureRequests?: boolean;
}

const SOURCE_RE = /^(?:'self'|'none'|https?:\/\/[A-Za-z0-9.*-]+(?::\d{1,5})?(?:\/[^\s;,']*)?|wss?:\/\/[A-Za-z0-9.*-]+(?::\d{1,5})?|data:|blob:)$/;

function sources(list: string[] | undefined): string[] {
  // Reject anything that could inject another directive (";", spaces, quotes) or weaken the policy.
  return (list ?? []).filter((s) => SOURCE_RE.test(s));
}

/**
 * Strict nonce-based CSP.
 * style-src keeps 'unsafe-inline': Next.js and Tailwind-driven components set inline `style`
 * attributes (next/image, next/font fallbacks, layout shims) which nonces cannot cover, and style
 * injection is far less dangerous than script injection. Scripts stay nonce-only + 'strict-dynamic'.
 */
export function buildCsp(nonce: string, opts: CspOptions = {}): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("CSP nonce must be base64 with at least 128 bits");
  const frameAncestors = sources(opts.frameAncestors);
  const frameSrc = sources(opts.frameSrc);
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...sources(opts.imgSrc)].join(" "),
    "font-src 'self' data:",
    ["connect-src 'self'", ...sources(opts.connectSrc), ...(opts.dev ? ["ws:", "wss:"] : [])].join(" "),
    `frame-src ${frameSrc.length ? frameSrc.join(" ") : "'none'"}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors.length ? frameAncestors.join(" ") : "'none'"}`,
  ];
  if (opts.upgradeInsecureRequests ?? !opts.dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Non-CSP security headers applied to every proxied response. */
export function securityHeaders(opts: { dev?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\"), usb=(), browsing-topics=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Frame-Options": "DENY",
  };
  if (!opts.dev) h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  return h;
}

/** 128-bit random nonce, base64. Web Crypto, so it works in both the Node and edge runtimes. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Recommended `config.matcher` for proxy.ts: skip API routes, static assets and prefetches (which do
 * not render HTML). Next requires `config` to be a static literal in proxy.ts, so copy this value
 * there rather than importing it.
 */
export const CSP_PROXY_MATCHER = [
  {
    source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|woff2?)$).*)",
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  },
] as const;

/**
 * Returns a Next 16 proxy function: per-request nonce, `x-nonce` + CSP on the forwarded request
 * headers (Next reads the CSP request header to nonce its own scripts; server components read
 * `x-nonce` via headers()), CSP + security headers on the response.
 *
 *   // proxy.ts
 *   export const proxy = cspProxy({ dev: process.env.NODE_ENV !== "production" });
 *   export const config = { matcher: [ ...copy of CSP_PROXY_MATCHER... ] };
 */
export function cspProxy(opts: CspOptions = {}): (req: NextRequest) => NextResponse {
  const extra = securityHeaders({ dev: opts.dev });
  return (req) => {
    const nonce = generateNonce();
    const csp = buildCsp(nonce, opts);
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce); // overwrites any client-sent x-nonce
    requestHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    for (const [k, v] of Object.entries(extra)) {
      if (k === "X-Frame-Options" && opts.frameAncestors?.length) continue; // frame-ancestors governs
      res.headers.set(k, v);
    }
    return res;
  };
}

// ------------------------------------------------------------------------------------------------
// Cron authentication
