import path from "node:path";
import type { NextConfig } from "next";

/**
 * The Content-Security-Policy (per-request nonce) and the page security headers come from src/proxy.ts
 * (@repo/ops cspProxy). The proxy skips /api routes, so those get their static headers here; there is
 * deliberately no CSP header in this file, so two policies can never conflict.
 */
const apiHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see /Dockerfile). Tracing root = monorepo root
  // so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@repo/auth", "@repo/billing", "@repo/config", "@repo/database", "@repo/monitoring", "@repo/ops", "@repo/security", "@repo/support"],
  // Help articles are read from disk at startup (support.sync_articles); ship them with the standalone server.
  outputFileTracingIncludes: { "/**": ["./content/help/**/*"] },
  serverExternalPackages: ["@electric-sql/pglite", "undici", "pdfkit", "pg"],
  async headers() {
    return [
      { source: "/api/:path*", headers: apiHeaders },
      { source: "/report/:id*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
