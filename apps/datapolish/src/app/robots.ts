import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = appUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/account", "/admin", "/login", "/verify-email", "/reset-password", "/forgot-password", "/accept-invitation/", "/support/tickets"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
