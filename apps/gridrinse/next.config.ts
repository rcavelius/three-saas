import path from "node:path";
import type { NextConfig } from "next";

/**
 * Security headers: the Content-Security-Policy (per-request nonce, connect-src 'self') and the other
 * security headers are set by src/proxy.ts via @repo/ops cspProxy. API routes are not proxied, so
 * the non-CSP headers are repeated here for them; no second CSP header is sent from here.
 */
const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see /Dockerfile). Tracing root = monorepo root
  // so workspace packages are included.
  // Netlify's Next.js adapter packages the server itself.
  output: process.env.NETLIFY === "true" ? undefined : "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@repo/auth", "@repo/billing", "@repo/ops", "@repo/database", "@repo/monitoring", "@repo/support"],
  // Help articles are read from disk at startup (support.sync_articles); ship them with the standalone server.
  outputFileTracingIncludes: { "/**": ["./content/help/**/*"] },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
