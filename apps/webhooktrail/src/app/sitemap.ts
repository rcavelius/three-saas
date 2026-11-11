import type { MetadataRoute } from "next";
import { getPlatform } from "@/lib/platform";
import { GUIDES } from "./guides/guides";

// Help articles come from the database, so the sitemap renders per request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL || "http://localhost:3003").replace(/\/$/, "");
  const pages = ["/", "/pricing", "/docs", "/guides", "/help", "/support", "/signup", "/privacy", "/terms"];
  const help = await (await getPlatform()).support.articleSlugs().catch(() => []);
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.7 })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...help.map((h) => ({ url: `${base}/help/${h.slug}`, lastModified: h.updated_on, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
