import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";
import { appUrl } from "@/lib/site";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  // /privacy and /terms are noindex drafts until legal review; add them back once published.
  const pages = ["/", "/pricing", "/guides", "/help", "/support", "/signup"];
  const help = await (await getPlatform()).support.articleSlugs().catch(() => []);
  return [
    ...pages.map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: "monthly" as const, priority: p === "/" ? 1 : 0.6 })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, changeFrequency: "yearly" as const, priority: 0.7 })),
    ...help.map((h) => ({ url: `${base}/help/${h.slug}`, lastModified: h.updated_on, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
