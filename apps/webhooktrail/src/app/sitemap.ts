import type { MetadataRoute } from "next";
import { TOOLS } from "@/content/tools";
import { legalInfo } from "@/lib/legal";
import { getPlatform } from "@/lib/platform";
import { GUIDES } from "./guides/guides";

// Help articles come from the database, so the sitemap renders per request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL || "http://localhost:3003").replace(/\/$/, "");
  // /privacy and /terms are listed only once published (LEGAL_APPROVED=1 etc.); until then they are noindex drafts.
  const legal = legalInfo().published ? ["/privacy", "/terms"] : [];
  const pages = ["/", "/pricing", "/docs", "/tools", "/guides", "/help", "/support", "/signup", ...legal];
  const help = await (await getPlatform()).support.articleSlugs().catch(() => []);
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.7 })),
    ...TOOLS.map((t) => ({ url: `${base}/tools/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...help.map((h) => ({ url: `${base}/help/${h.slug}`, lastModified: h.updated_on, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
