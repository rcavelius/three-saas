/**
 * Help articles: Markdown files with front matter under apps/<app>/content/help/*.md, synced into
 * `support_articles` (upsert by slug, skipped when the content hash is unchanged; files that disappeared
 * are deleted) and split into heading-sized chunks for retrieval.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { DbHandle } from "@repo/database";
import { markdownToText, parseMarkdown, inlineText } from "./markdown";

export const ARTICLE_CATEGORIES = [
  "Getting started",
  "Plans & billing",
  "Account & security",
  "Troubleshooting",
  "API & integrations",
  "Privacy & data",
  "Getting help",
] as const;

const frontMatterSchema = z.object({
  title: z.string().min(3).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: lowercase letters, digits and hyphens").max(80),
  summary: z.string().min(10).max(200),
  category: z.enum(ARTICLE_CATEGORIES),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "updated: YYYY-MM-DD"),
});

export type ArticleMeta = z.infer<typeof frontMatterSchema>;
export interface ArticleSource extends ArticleMeta {
  body: string;
  hash: string;
}

export class ArticleError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "ArticleError";
  }
}

/** Parses one file. Front matter is `key: value` lines between `---` fences; every key is required. */
export function parseArticle(raw: string, fileName?: string): ArticleSource {
  const file = fileName ?? "(article)";
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new ArticleError(file, "missing front matter (--- ... ---)");
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    if (!line.trim()) continue;
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (!kv) throw new ArticleError(file, `invalid front matter line "${line.slice(0, 40)}"`);
    let v = kv[2]!.trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    fields[kv[1]!] = v;
  }
  const parsed = frontMatterSchema.safeParse(fields);
  if (!parsed.success) {
    throw new ArticleError(file, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const expected = file.replace(/^.*[\\/]/, "").replace(/\.md$/, "");
  if (file.endsWith(".md") && expected !== parsed.data.slug) throw new ArticleError(file, `slug "${parsed.data.slug}" must match the file name`);
  const body = m[2]!.trim();
  if (body.length < 20) throw new ArticleError(file, "body is empty");
  if (body.length > 40_000) throw new ArticleError(file, "body is too long (max 40,000 chars)");
  const hash = createHash("sha256").update(JSON.stringify([parsed.data, body])).digest("hex");
  return { ...parsed.data, body, hash };
}

export async function loadArticlesFromDir(dir: string): Promise<ArticleSource[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".md")).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: ArticleSource[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const a = parseArticle(await readFile(join(dir, n), "utf8"), n);
    if (seen.has(a.slug)) throw new ArticleError(n, `duplicate slug ${a.slug}`);
    seen.add(a.slug);
    out.push(a);
  }
  return out;
}

export interface Chunk {
  heading: string;
  text: string;
}

/** Splits an article into chunks at `##` headings; long sections are split again by paragraph. */
export function chunkArticle(a: Pick<ArticleSource, "title" | "summary" | "body">, maxChars = 1400): Chunk[] {
  const blocks = parseMarkdown(a.body);
  const sections: Chunk[] = [{ heading: a.title, text: a.summary }];
  for (const b of blocks) {
    if (b.type === "heading" && b.level === 2) {
      sections.push({ heading: inlineText(b.children), text: "" });
      continue;
    }
    const cur = sections[sections.length - 1]!;
    const t =
      b.type === "code"
        ? b.text
        : b.type === "list"
          ? b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${inlineText(it)}`).join("\n")
          : inlineText(b.children);
    cur.text = cur.text ? `${cur.text}\n\n${t}` : t;
  }
  const out: Chunk[] = [];
  for (const s of sections) {
    if (!s.text.trim()) continue;
    if (s.text.length <= maxChars) {
      out.push(s);
      continue;
    }
    let acc = "";
    for (const p of s.text.split(/\n\n/)) {
      if (acc && acc.length + p.length > maxChars) {
        out.push({ heading: s.heading, text: acc });
        acc = "";
      }
      acc = acc ? `${acc}\n\n${p}` : p.slice(0, maxChars * 2);
    }
    if (acc) out.push({ heading: s.heading, text: acc });
  }
  return out;
}

export interface SyncReport {
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
}

/** Upserts the given articles and deletes rows whose slug is no longer present. One transaction. */
export async function syncArticles(handle: Pick<DbHandle<any>, "transaction">, articles: ArticleSource[], now = new Date()): Promise<SyncReport> {
  return handle.transaction(async (tx) => {
    const report: SyncReport = { inserted: 0, updated: 0, unchanged: 0, removed: 0 };
    const { rows } = await tx.query<{ slug: string; content_hash: string }>(`SELECT slug, content_hash FROM support_articles`);
    const existing = new Map(rows.map((r) => [r.slug, r.content_hash]));
    for (const a of articles) {
      const prev = existing.get(a.slug);
      if (prev === a.hash) {
        report.unchanged++;
        continue;
      }
      const plain = markdownToText(a.body);
      const { rows: up } = await tx.query<{ id: string }>(
        `INSERT INTO support_articles (slug, title, summary, category, body, updated_on, content_hash, search, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
           setweight(to_tsvector('english', $2), 'A') || setweight(to_tsvector('english', $3), 'B') ||
           setweight(to_tsvector('english', $8), 'D'), $9)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, category = EXCLUDED.category,
           body = EXCLUDED.body, updated_on = EXCLUDED.updated_on, content_hash = EXCLUDED.content_hash,
           search = EXCLUDED.search, synced_at = EXCLUDED.synced_at
         RETURNING id`,
        [a.slug, a.title, a.summary, a.category, a.body, a.updated, a.hash, plain, now.toISOString()],
      );
      const id = up[0]!.id;
      await tx.query(`DELETE FROM support_article_chunks WHERE article_id = $1`, [id]);
      const chunks = chunkArticle(a);
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        await tx.query(
          `INSERT INTO support_article_chunks (article_id, ord, heading, body, search)
           VALUES ($1, $2, $3, $4, setweight(to_tsvector('english', $5), 'A') || setweight(to_tsvector('english', $3), 'B') ||
             setweight(to_tsvector('english', $4), 'D'))`,
          [id, i, c.heading, c.text, a.title],
        );
      }
      if (prev === undefined) report.inserted++;
      else report.updated++;
    }
    const keep = articles.map((a) => a.slug);
    const { rows: gone } = await tx.query<{ slug: string }>(
      `DELETE FROM support_articles WHERE NOT (slug = ANY($1::text[])) RETURNING slug`,
      [keep],
    );
    report.removed = gone.length;
    return report;
  });
}
