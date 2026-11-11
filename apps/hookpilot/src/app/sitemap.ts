import type { MetadataRoute } from "next";
import { GUIDES } from "./guides/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL || "http://localhost:3003").replace(/\/$/, "");
  const pages = ["/", "/pricing", "/docs", "/guides", "/signup", "/privacy", "/terms"];
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.7 })),
    ...GUIDES.map((g) => ({ url: `${base}/guides/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
