import { GUIDES } from "@/lib/guides";
import { TOOLS } from "@/content/tools";
import type { LegalInfo } from "@/lib/legal";

export type SitemapPath = { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" };

/** Public, indexable pages (help articles are added by the route from the database). */
export function sitemapPaths(legal: Pick<LegalInfo, "published">, helpSlugs: string[] = []): SitemapPath[] {
  return [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/docs", priority: 0.7, changeFrequency: "monthly" },
    { path: "/tools", priority: 0.8, changeFrequency: "monthly" },
    ...TOOLS.map((t) => ({ path: `/tools/${t.slug}`, priority: 0.8, changeFrequency: "monthly" as const })),
    { path: "/guides", priority: 0.6, changeFrequency: "monthly" },
    ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, priority: 0.6, changeFrequency: "monthly" as const })),
    { path: "/help", priority: 0.6, changeFrequency: "monthly" },
    ...helpSlugs.map((slug) => ({ path: `/help/${slug}`, priority: 0.5, changeFrequency: "monthly" as const })),
    { path: "/support", priority: 0.4, changeFrequency: "yearly" },
    { path: "/bot", priority: 0.4, changeFrequency: "yearly" },
    { path: "/signup", priority: 0.4, changeFrequency: "yearly" },
    // /privacy and /terms stay noindex drafts until the operator details are set and approved (LEGAL_APPROVED=1).
    ...(legal.published
      ? [
          { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
          { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
        ]
      : []),
  ];
}
