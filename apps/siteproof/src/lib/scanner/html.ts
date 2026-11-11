import * as cheerio from "cheerio";
import type { ParsedPage, Subresource } from "./types";
import { resolveHref } from "./url-utils";

function relTokens(v: string | undefined): string[] {
  return (v ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/** Pure HTML extraction: everything the checks need from one document. */
export function parsePage(html: string, pageUrl: string, headers: Record<string, string> = {}): ParsedPage {
  const $ = cheerio.load(html);

  let base = pageUrl;
  const baseHref = $("base[href]").first().attr("href");
  if (baseHref) {
    try {
      base = new URL(baseHref, pageUrl).href;
    } catch {
      /* keep page URL */
    }
  }

  const titles = $("title").filter((_, el) => $(el).closest("svg").length === 0);
  const titleText = titles.length ? titles.first().text().replace(/\s+/g, " ").trim() : null;

  const metaDescriptions: string[] = [];
  const robotsDirectives: string[] = [];
  $("meta[name]").each((_, el) => {
    const name = ($(el).attr("name") ?? "").trim().toLowerCase();
    const content = $(el).attr("content") ?? "";
    if (name === "description") metaDescriptions.push(content.replace(/\s+/g, " ").trim());
    if (name === "robots" || name === "siteproofbot") {
      robotsDirectives.push(...content.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));
    }
  });
  const xRobots = headers["x-robots-tag"];
  if (xRobots) {
    for (const part of xRobots.toLowerCase().split(",")) {
      const v = part.trim();
      // "googlebot: noindex" style entries are bot-specific; plain directives apply to all.
      if (v && !/^[a-z0-9_-]+\s*:/.test(v)) robotsDirectives.push(v);
    }
  }

  const canonicals: ParsedPage["canonicals"] = [];
  $("link[rel]").each((_, el) => {
    if (!relTokens($(el).attr("rel")).includes("canonical")) return;
    const raw = $(el).attr("href") ?? null;
    let resolved: string | null = null;
    if (raw !== null && raw.trim() !== "") {
      try {
        const u = new URL(raw.trim(), base);
        if (u.protocol === "http:" || u.protocol === "https:") {
          u.hash = "";
          resolved = u.href;
        }
      } catch {
        resolved = null;
      }
    }
    canonicals.push({ raw, resolved, inHead: $(el).closest("head").length > 0 });
  });
  const linkHeader = headers["link"];
  if (linkHeader) {
    for (const m of linkHeader.matchAll(/<([^>]*)>\s*;[^,]*rel="?canonical"?/gi)) {
      const resolved = resolveHref(m[1], pageUrl);
      canonicals.push({ raw: m[1] ?? null, resolved, inHead: true });
    }
  }

  const links: ParsedPage["links"] = [];
  $("a[href], area[href]").each((_, el) => {
    const href = resolveHref($(el).attr("href"), base);
    if (!href) return;
    links.push({
      href,
      text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 120),
      nofollow: relTokens($(el).attr("rel")).includes("nofollow"),
    });
  });

  const images: ParsedPage["images"] = [];
  $("img").each((_, el) => {
    const $el = $(el);
    if (($el.attr("aria-hidden") ?? "").toLowerCase() === "true") return;
    const src = $el.attr("src") ?? $el.attr("data-src") ?? "";
    const alt = $el.attr("alt");
    images.push({ src: resolveHref(src, base) ?? src, alt: alt === undefined ? null : alt });
  });

  const subresources: Subresource[] = [];
  const add = (raw: string | undefined, tag: string, kind: Subresource["kind"]) => {
    const url = resolveHref(raw, base);
    if (url) subresources.push({ url, tag, kind });
  };
  const addSrcset = (raw: string | undefined, tag: string) => {
    if (!raw) return;
    for (const candidate of raw.split(",")) add(candidate.trim().split(/\s+/)[0], tag, "passive");
  };
  $("script[src]").each((_, el) => add($(el).attr("src"), "script", "active"));
  $("link[href]").each((_, el) => {
    const rel = relTokens($(el).attr("rel"));
    if (rel.includes("stylesheet")) add($(el).attr("href"), "stylesheet", "active");
    else if (rel.includes("icon") || rel.includes("preload")) add($(el).attr("href"), "link", "passive");
  });
  $("iframe[src]").each((_, el) => add($(el).attr("src"), "iframe", "active"));
  $("object[data]").each((_, el) => add($(el).attr("data"), "object", "active"));
  $("embed[src]").each((_, el) => add($(el).attr("src"), "embed", "active"));
  $("img[src]").each((_, el) => add($(el).attr("src"), "img", "passive"));
  $("img[srcset], source[srcset]").each((_, el) => addSrcset($(el).attr("srcset"), el.tagName));
  $("audio[src], video[src], source[src], track[src]").each((_, el) => add($(el).attr("src"), el.tagName, "passive"));
  $("video[poster]").each((_, el) => add($(el).attr("poster"), "video poster", "passive"));
  $("form[action]").each((_, el) => add($(el).attr("action"), "form", "form"));

  return {
    title: titleText,
    titleCount: titles.length,
    metaDescription: metaDescriptions.length ? metaDescriptions[0]! : null,
    metaDescriptionCount: metaDescriptions.length,
    robotsDirectives,
    canonicals,
    links,
    images,
    subresources,
  };
}

export function isNoindex(directives: string[]): boolean {
  return directives.includes("noindex") || directives.includes("none");
}
