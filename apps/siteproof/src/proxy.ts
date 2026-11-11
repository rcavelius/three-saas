import type { NextRequest } from "next/server";
import { cspProxy } from "@repo/ops/next";

const inner = cspProxy({ dev: process.env.NODE_ENV !== "production" });
// A plain-http origin (local production smoke tests) cannot use upgrade-insecure-requests: it would turn
// every same-origin asset request into an https request that nothing answers.
const plainHttp = (process.env.APP_URL ?? "").startsWith("http://");

/** Per-request nonce CSP + security headers (Next 16 proxy). */
export function proxy(req: NextRequest) {
  const res = inner(req);
  if (plainHttp) {
    const csp = res.headers.get("Content-Security-Policy");
    if (csp) res.headers.set("Content-Security-Policy", csp.replace(/;\s*upgrade-insecure-requests/, ""));
    res.headers.delete("Strict-Transport-Security");
  }
  return res;
}

// Copy of CSP_PROXY_MATCHER from @repo/ops/next (Next requires a static literal here).
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
