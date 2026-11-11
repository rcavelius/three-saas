import type { NextRequest } from "next/server";
import { cspProxy } from "@repo/ops/next";

// A plain-http origin (local production smoke tests) cannot use upgrade-insecure-requests or HSTS.
const plainHttp = (process.env.APP_URL ?? "").startsWith("http://");
const inner = cspProxy({ dev: process.env.NODE_ENV !== "production", upgradeInsecureRequests: plainHttp ? false : undefined });

/** Per-request nonce CSP + security headers (Next 16 proxy). */
export function proxy(req: NextRequest) {
  const res = inner(req);
  if (plainHttp) res.headers.delete("Strict-Transport-Security");
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
