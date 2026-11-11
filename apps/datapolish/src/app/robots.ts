import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  // Staging must never be indexed.
  if (process.env.STAGING_PASSWORD) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/account", "/admin", "/login", "/verify-email", "/reset-password", "/forgot-password", "/accept-invitation/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
