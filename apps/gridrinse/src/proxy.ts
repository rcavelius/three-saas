/**
 * Per-request nonce CSP (Next 16 proxy). connect-src stays 'self' ONLY: that is what backs the privacy
 * promise at the browser level — even a bug could not send file contents to another server. Stripe
 * Checkout and the Billing Portal are full-page navigations, so they need no connect-src entry.
 */
import type { NextRequest } from "next/server";
import { cspProxy } from "@repo/ops/csp";
import { stagingGate } from "@repo/ops/staging";

const dev = process.env.NODE_ENV !== "production";
const base = cspProxy({ dev });
/** Non-public staging deployments: Basic auth on every page and API (STAGING_PASSWORD), noindex. */
const staging = stagingGate({
  password: process.env.STAGING_PASSWORD,
  realm: "GridRinse staging",
  exempt: ["/api/cron/", "/api/health", "/api/billing/webhook"],
});

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
  const denied = staging(req);
  if (denied) return denied;
  if (req.nextUrl.pathname.startsWith("/api/")) return; // API routes: no CSP needed, just the gate
  const res = base(req);
  if (process.env.STAGING_PASSWORD) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  if (plainHttpLocal) {
    const csp = res.headers.get("Content-Security-Policy");
    if (csp) res.headers.set("Content-Security-Policy", csp.replace(/;\s*upgrade-insecure-requests/, ""));
    res.headers.delete("Strict-Transport-Security");
  }
  return res;
}

// Based on CSP_PROXY_MATCHER in @repo/ops/next (Next requires a static literal here). No `missing`
// prefetch exclusion: a client-controlled header must never let a request skip the staging gate.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|woff2?|mp4|webm)$).*)"
    },
  ],
};
