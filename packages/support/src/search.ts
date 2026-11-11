/**
 * Postgres full-text search over help articles (title A > summary B > body D) and their chunks.
 * The user's text never reaches to_tsquery syntax directly: it is reduced to [a-z0-9] tokens joined
 * with OR, so any input is a valid query and ranking (ts_rank_cd) rewards documents matching more terms.
 */
import type { SqlExecutor } from "./types";

export interface ArticleHit {
  slug: string;
  title: string;
  summary: string;
  category: string;
  rank: number;
}

export interface ChunkHit {
  slug: string;
  title: string;
  heading: string;
  text: string;
  rank: number;
}

export interface ArticleRow {
  slug: string;
  title: string;
  summary: string;
  category: string;
  body: string;
  updated_on: string;
}

const MAX_TERMS = 24;

/** Returns a to_tsquery expression like `cancel | subscript:*`, or null when nothing searchable remains. */
export function buildTsQuery(q: string): string | null {
  const tokens = (q.toLowerCase().normalize("NFKD").match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2 && t.length <= 40);
  const uniq = [...new Set(tokens)].slice(0, MAX_TERMS);
  if (uniq.length === 0) return null;
  return uniq.map((t, i) => (i === uniq.length - 1 && t.length >= 3 ? `${t}:*` : t)).join(" | ");
}

export async function searchArticles(ex: SqlExecutor, q: string, limit = 10): Promise<ArticleHit[]> {
  const tsq = buildTsQuery(q);
  if (!tsq) return [];
  const { rows } = await ex.query<ArticleHit>(
    `SELECT slug, title, summary, category, ts_rank_cd(search, query) AS rank
     FROM support_articles, to_tsquery('english', $1) query
     WHERE search @@ query
     ORDER BY rank DESC, title ASC
     LIMIT $2`,
    [tsq, Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}

/** Top chunks for retrieval; at most `perArticle` chunks from one article so answers can draw on several. */
export async function searchChunks(ex: SqlExecutor, q: string, limit = 5, perArticle = 2): Promise<ChunkHit[]> {
  const tsq = buildTsQuery(q);
  if (!tsq) return [];
  const { rows } = await ex.query<ChunkHit>(
    `SELECT slug, title, heading, text, rank FROM (
       SELECT a.slug, a.title, c.heading, c.body AS text, ts_rank_cd(c.search, query) AS rank,
              row_number() OVER (PARTITION BY a.id ORDER BY ts_rank_cd(c.search, query) DESC, c.ord) AS n
       FROM support_article_chunks c JOIN support_articles a ON a.id = c.article_id, to_tsquery('english', $1) query
       WHERE c.search @@ query
     ) ranked
     WHERE n <= $3
     ORDER BY rank DESC, slug ASC
     LIMIT $2`,
    [tsq, Math.min(Math.max(limit, 1), 20), perArticle],
  );
  return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}

export async function listArticles(ex: SqlExecutor): Promise<Omit<ArticleHit, "rank">[]> {
  const { rows } = await ex.query<Omit<ArticleHit, "rank">>(
    `SELECT slug, title, summary, category FROM support_articles ORDER BY category, title`,
  );
  return rows;
}

export async function getArticle(ex: SqlExecutor, slug: string): Promise<ArticleRow | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { rows } = await ex.query<ArticleRow>(
    `SELECT slug, title, summary, category, body, to_char(updated_on, 'YYYY-MM-DD') AS updated_on
     FROM support_articles WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function articleSlugs(ex: SqlExecutor): Promise<{ slug: string; updated_on: string }[]> {
  const { rows } = await ex.query<{ slug: string; updated_on: string }>(
    `SELECT slug, to_char(updated_on, 'YYYY-MM-DD') AS updated_on FROM support_articles ORDER BY slug`,
  );
  return rows;
}
