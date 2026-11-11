import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL || "http://localhost:3003").replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private: API, accounts, ops, inspector pages and capture URLs.
        disallow: ["/api/", "/account", "/admin", "/app", "/e/", "/h/", "/verify-email", "/reset-password", "/accept-invitation/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
