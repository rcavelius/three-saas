import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { env } from "@/lib/env";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = new URL(env().APP_URL).origin;
  const help = await (await getPlatform()).support.articleSlugs().catch(() => []);
  const pages: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/docs", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guides", priority: 0.6, changeFrequency: "monthly" },
    ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, priority: 0.6, changeFrequency: "monthly" as const })),
    { path: "/help", priority: 0.6, changeFrequency: "monthly" },
    ...help.map((h) => ({ path: `/help/${h.slug}`, priority: 0.5, changeFrequency: "monthly" as const })),
    { path: "/support", priority: 0.4, changeFrequency: "yearly" },
    { path: "/bot", priority: 0.4, changeFrequency: "yearly" },
    { path: "/signup", priority: 0.4, changeFrequency: "yearly" },
    // /privacy and /terms are noindex drafts until legal review; add them here once published.
  ];
  return pages.map((p) => ({ url: `${base}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
