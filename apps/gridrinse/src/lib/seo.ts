import type { Metadata } from "next";

/** Social preview images, served by src/app/og/[key]/route.tsx: one general card and one per /tools page. */
export function ogImage(toolSlug?: string): { url: string; width: number; height: number; alt: string } {
  return {
    url: `/og/${toolSlug ?? "default"}.png`,
    width: 1200,
    height: 630,
    alt: "GridRinse: clean CSV and Excel files in your browser. Files are never uploaded.",
  };
}

/**
 * Complete metadata for an indexable page: title, description, canonical, Open Graph (with its own og:url and an
 * image) and a large Twitter card. Without this, a page that sets no openGraph inherits the homepage's og:title.
 */
export function pageMeta(o: { title: string; description: string; path: string; type?: "website" | "article"; toolSlug?: string; absoluteTitle?: boolean }): Metadata {
  const image = ogImage(o.toolSlug);
  const ogTitle = o.absoluteTitle ? o.title : `${o.title} · GridRinse`;
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { type: o.type ?? "website", siteName: "GridRinse", title: ogTitle, description: o.description, url: o.path, images: [image] },
    twitter: { card: "summary_large_image", title: ogTitle, description: o.description, images: [image.url] },
  };
}

/** BreadcrumbList JSON-LD from [name, path] pairs (path "/" = home). */
export function breadcrumbLd(base: string, items: [string, string][]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${base}${path === "/" ? "" : path}` })),
  };
}
