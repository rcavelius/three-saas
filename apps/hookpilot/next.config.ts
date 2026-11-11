import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * App-wide CSP. Next.js injects inline bootstrap scripts, so script-src needs 'unsafe-inline'
 * (a nonce-based policy via proxy.ts is a later hardening step); dev additionally needs eval + HMR.
 * Capture URLs (/h/...) are excluded here and set their own stricter `sandbox` policy.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see /Dockerfile). Tracing root = monorepo root
  // so workspace packages are included.
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@repo/config", "@repo/database", "@repo/monitoring"],
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
    ];
    return [
      { source: "/:path*", headers: common },
      { source: "/((?!h/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
    ];
  },
};

export default nextConfig;
