import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";
import { appUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const pages = ["/", "/pricing", "/guides", "/privacy", "/terms", "/signup"];
  return [
    ...pages.map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: "monthly" as const, priority: p === "/" ? 1 : 0.6 })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, changeFrequency: "yearly" as const, priority: 0.7 })),
  ];
}
