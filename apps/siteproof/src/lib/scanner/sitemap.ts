import * as cheerio from "cheerio";
import { gunzipSync } from "node:zlib";

export type ParsedSitemap =
  | { ok: true; kind: "urlset" | "sitemapindex"; locs: string[] }
  | { ok: false; error: string };

const MAX_DECOMPRESSED = 10 * 1024 * 1024;

/** Decodes a sitemap body (plain or .xml.gz without Content-Encoding). */
export function decodeSitemapBody(body: Buffer): string {
  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) {
    return gunzipSync(body, { maxOutputLength: MAX_DECOMPRESSED }).toString("utf8");
  }
  return body.toString("utf8");
}

/**
 * Parses sitemap XML. Cheerio's XML mode is lenient, so we add structural checks that catch the common failures:
 * an HTML page served at /sitemap.xml, a wrong root element, unbalanced tags, or <url> entries without <loc>.
 */
export function parseSitemap(xml: string): ParsedSitemap {
  const text = xml.replace(/^﻿/, "").trim();
  if (!text) return { ok: false, error: "The file is empty." };
  if (/^<!doctype html|^<html[\s>]/i.test(text)) return { ok: false, error: "An HTML page was returned instead of XML." };
  if (!text.startsWith("<")) return { ok: false, error: "The response is not XML." };

  const stripped = text
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const open = (stripped.match(/<[A-Za-z][^>]*[^/]>|<[A-Za-z]>/g) ?? []).length;
  const close = (stripped.match(/<\/[A-Za-z][^>]*>/g) ?? []).length;
  if (open !== close) {
    return { ok: false, error: "The XML is not well-formed (unbalanced tags)." };
  }

  const $ = cheerio.load(text, { xml: true });
  const root = $.root().children().first();
  const rootName = (root.prop("tagName") as string | undefined)?.toLowerCase().replace(/^.*:/, "");
  if (rootName !== "urlset" && rootName !== "sitemapindex") {
    return { ok: false, error: `Unexpected root element <${rootName ?? "none"}>; expected <urlset> or <sitemapindex>.` };
  }
  const entryTag = rootName === "urlset" ? "url" : "sitemap";
  const locs: string[] = [];
  let missingLoc = 0;
  root.children().each((_, el) => {
    const name = ((el as { tagName?: string }).tagName ?? "").toLowerCase().replace(/^.*:/, "");
    if (name !== entryTag) return;
    const loc = $(el)
      .children()
      .filter((_, c) => ((c as { tagName?: string }).tagName ?? "").toLowerCase().replace(/^.*:/, "") === "loc")
      .first()
      .text()
      .trim();
    if (loc) locs.push(loc);
    else missingLoc++;
  });
  if (missingLoc > 0) return { ok: false, error: `${missingLoc} <${entryTag}> entr${missingLoc === 1 ? "y has" : "ies have"} no <loc>.` };
  return { ok: true, kind: rootName, locs };
}
