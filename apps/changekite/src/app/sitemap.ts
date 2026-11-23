import type { MetadataRoute } from "next";
import { legalInfo } from "@/lib/legal";
import { sitemapPaths } from "@/lib/sitemap-paths";
import { env } from "@/lib/env";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = new URL(env().APP_URL).origin;
  const help = await (await getPlatform()).support.articleSlugs().catch(() => []);
  return sitemapPaths(legalInfo(), help.map((h) => h.slug)).map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
