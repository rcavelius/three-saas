import { cspProxy } from "@repo/ops/csp";

/**
 * Nonce-based CSP for every rendered page (fresh 128-bit nonce per request). API routes and the
 * public capture URLs (/h/...) are excluded: capture responses carry their own `sandbox` CSP.
 * WT_CSP_NO_UPGRADE=1 drops upgrade-insecure-requests ONLY for local smoke tests of a production
 * build over plain http://localhost; never set it in a deployment.
 */
export const proxy = cspProxy({
  dev: process.env.NODE_ENV !== "production",
  ...(process.env.WT_CSP_NO_UPGRADE === "1" ? { upgradeInsecureRequests: false } : {}),
});

// Static literal (Next requirement): CSP_PROXY_MATCHER from @repo/ops/next plus the /h/ capture exclusion.
export const config = {
  matcher: [
    {
      source:
        "/((?!api|h/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|woff2?|mp4|webm)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
