import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Pages get a nonce-based CSP plus security headers from src/proxy.ts (@repo/ops cspProxy); no
 * 'unsafe-inline' scripts anywhere. The headers below only cover what the proxy does not handle
 * (API routes and the public capture URLs /h/..., which set their own `sandbox` CSP), so no
 * response ever carries two conflicting CSP headers.
 */
const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see /Dockerfile). Tracing root = monorepo root
  // so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@repo/config", "@repo/database", "@repo/monitoring", "@repo/auth", "@repo/billing", "@repo/ops", "@repo/security", "@repo/support"],
  // Help articles are read from disk at startup (support.sync_articles); ship them with the standalone server.
  outputFileTracingIncludes: { "/**": ["./content/help/**/*"] },
  serverExternalPackages: ["@electric-sql/pglite", "stripe", "undici", "pg"],
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
    ];
    return [
      { source: "/api/:path*", headers: [...common, { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
      { source: "/h/:path*", headers: common },
    ];
  },
};

export default nextConfig;
