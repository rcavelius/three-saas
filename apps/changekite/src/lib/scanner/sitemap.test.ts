import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeSitemapBody, parseSitemap } from "./sitemap";

describe("parseSitemap", () => {
  it("parses a urlset", () => {
    const r = parseSitemap(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc> https://example.com/about </loc></url>
</urlset>`);
    expect(r).toEqual({ ok: true, kind: "urlset", locs: ["https://example.com/", "https://example.com/about"] });
  });

  it("parses a sitemap index", () => {
    const r = parseSitemap(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://example.com/a.xml</loc></sitemap><sitemap><loc>https://example.com/b.xml</loc></sitemap></sitemapindex>`);
    expect(r).toEqual({ ok: true, kind: "sitemapindex", locs: ["https://example.com/a.xml", "https://example.com/b.xml"] });
  });

  it("rejects HTML, wrong roots, unbalanced XML and entries without loc", () => {
    expect(parseSitemap("<!DOCTYPE html><html><body>Not found</body></html>").ok).toBe(false);
    expect(parseSitemap("<rss><channel></channel></rss>")).toMatchObject({ ok: false, error: expect.stringContaining("<rss>") });
    expect(parseSitemap("<urlset><url><loc>https://e.com/</loc></url>")).toMatchObject({ ok: false, error: expect.stringContaining("well-formed") });
    expect(parseSitemap("<urlset><url><lastmod>2026</lastmod></url></urlset>")).toMatchObject({ ok: false, error: expect.stringContaining("no <loc>") });
    expect(parseSitemap("")).toMatchObject({ ok: false });
    expect(parseSitemap("hello")).toMatchObject({ ok: false });
  });

  it("accepts an empty urlset (reported as empty by the check)", () => {
    expect(parseSitemap('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>')).toEqual({ ok: true, kind: "urlset", locs: [] });
  });

  it("decodes gzipped sitemaps served without Content-Encoding", () => {
    const xml = "<urlset><url><loc>https://e.com/</loc></url></urlset>";
    expect(decodeSitemapBody(gzipSync(xml))).toBe(xml);
    expect(decodeSitemapBody(Buffer.from(xml))).toBe(xml);
  });
});
