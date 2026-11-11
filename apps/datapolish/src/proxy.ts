/**
 * Per-request nonce CSP (Next 16 proxy). connect-src stays 'self' ONLY: that is what backs the privacy
 * promise at the browser level — even a bug could not send file contents to another server. Stripe
 * Checkout and the Billing Portal are full-page navigations, so they need no connect-src entry.
 */
import type { NextRequest } from "next/server";
import { cspProxy } from "@repo/ops/next";

const dev = process.env.NODE_ENV !== "production";
const base = cspProxy({ dev });

/** `upgrade-insecure-requests` would break a production build served over plain http://localhost (e2e). */
const plainHttpLocal = (() => {
  try {
    const u = new URL(process.env.APP_URL ?? "");
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
})();

export function proxy(req: NextRequest) {
  const res = base(req);
  if (plainHttpLocal) {
    const csp = res.headers.get("Content-Security-Policy");
    if (csp) res.headers.set("Content-Security-Policy", csp.replace(/;\s*upgrade-insecure-requests/, ""));
    res.headers.delete("Strict-Transport-Security");
  }
  return res;
}

// Copied from CSP_PROXY_MATCHER in @repo/ops/next (Next requires a static literal here).
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
