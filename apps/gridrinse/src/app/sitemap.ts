import type { MetadataRoute } from "next";
import { AUDIENCES } from "@/content/audiences";
import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { TEMPLATES } from "@/content/templates";
import { appUrl } from "@/lib/site";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const pages = ["/", "/how-it-works", "/features", "/pricing", "/tools", "/templates", "/guides", "/help", "/support", "/signup", "/terms", "/privacy"];
  const help = await (await getPlatform()).support.articleSlugs().catch(() => []);
  return [
    ...pages.map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: "monthly" as const, priority: p === "/" ? 1 : 0.6 })),
    ...TOOLS.map((t) => ({ url: `${base}/tools/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.9 })),
    ...TEMPLATES.map((t) => ({ url: `${base}/templates/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.9 })),
    ...AUDIENCES.map((a) => ({ url: `${base}/for/${a.slug}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, changeFrequency: "yearly" as const, priority: 0.7 })),
    ...help.map((h) => ({ url: `${base}/help/${h.slug}`, lastModified: h.updated_on, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
