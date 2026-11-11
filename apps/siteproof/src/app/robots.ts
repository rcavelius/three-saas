import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = new URL(env().APP_URL).origin;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/account", "/admin", "/dashboard", "/report/", "/accept-invitation/", "/reset-password", "/verify-email"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
