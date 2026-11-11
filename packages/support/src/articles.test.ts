import { afterEach, describe, expect, it } from "vitest";
import { rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ArticleError, chunkArticle, loadArticlesFromDir, parseArticle, syncArticles } from "./articles";
import { buildTsQuery, getArticle, listArticles, searchArticles, searchChunks } from "./search";
import { parseInline, parseMarkdown, safeHref } from "./markdown";
import { ARTICLES, makeDb, writeArticles } from "./test/helpers";
import type { DbHandle } from "@repo/database";

const fm = (over: Record<string, string> = {}, body = "Some body text that is long enough.") => {
  const f = { title: "A title", slug: "a-title", summary: "A summary that is fine.", category: "Getting started", updated: "2026-11-11", ...over };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${body}`;
};

describe("front matter validation", () => {
  it("parses a valid article and hashes its content", () => {
    const a = parseArticle(fm(), "a-title.md");
    expect(parseArticle(fm()).slug).toBe("a-title");
    expect(a).toMatchObject({ title: "A title", slug: "a-title", category: "Getting started", updated: "2026-11-11" });
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parseArticle(fm({}, "Different body text, still long.")).hash).not.toBe(a.hash);
  });

  it.each([
    ["missing front matter", "no fences here at all, just text"],
    ["missing title", fm({ title: "" })],
    ["bad slug", fm({ slug: "Bad Slug!" })],
    ["unknown category", fm({ category: "Random" })],
    ["bad date", fm({ updated: "11/11/2026" })],
    ["summary too long", fm({ summary: "x".repeat(201) })],
    ["empty body", fm({}, "")],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseArticle(raw, "a-title.md")).toThrow(ArticleError);
  });

  it("requires the slug to match the file name", () => {
    expect(() => parseArticle(fm(), "other.md")).toThrow(/must match the file name/);
  });
});

describe("markdown subset", () => {
  it("keeps raw HTML as text and drops unsafe links", () => {
    const blocks = parseMarkdown(`## Hi <script>alert(1)</script>\n\nClick [here](javascript:alert(1)) or [docs](/docs) or [x](//evil.example).`);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    const text = JSON.stringify(blocks);
    expect(text).toContain("<script>alert(1)</script>"); // literal text, rendered escaped by React
    expect(text).not.toContain("javascript:");
    expect(text).toContain('"href":"/docs"');
    expect(text).not.toContain("evil.example\"");
    expect(safeHref("https://stripe.com/x")).toBe("https://stripe.com/x");
    expect(safeHref("data:text/html,1")).toBeNull();
  });

  it("parses lists, code and emphasis", () => {
    const b = parseMarkdown("- one **bold**\n- two `code`\n\n1. first\n2. second\n\n```\nnpm i\n```");
    expect(b.map((x) => x.type)).toEqual(["list", "list", "code"]);
    expect(parseInline("a *b* c")[1]).toMatchObject({ type: "em" });
  });

  it("chunks by section heading", () => {
    const c = chunkArticle(parseArticle(ARTICLES["cancel-subscription"]!, "cancel-subscription.md"));
    expect(c.map((x) => x.heading)).toEqual(["Cancel your subscription", "Cancel from the billing page", "Refunds"]);
  });
});

describe("article loader and sync", () => {
  let handle: DbHandle<any> | null = null;
  let dir = "";
  afterEach(async () => {
    await handle?.close();
    handle = null;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("inserts, skips unchanged, updates changed and removes deleted articles", async () => {
    handle = await makeDb();
    dir = writeArticles();
    const r1 = await syncArticles(handle, await loadArticlesFromDir(dir));
    expect(r1).toEqual({ inserted: 4, updated: 0, unchanged: 0, removed: 0 });
    expect((await listArticles(handle.executor)).length).toBe(4);

    const r2 = await syncArticles(handle, await loadArticlesFromDir(dir));
    expect(r2).toEqual({ inserted: 0, updated: 0, unchanged: 4, removed: 0 });

    writeFileSync(join(dir, "reset-password.md"), ARTICLES["reset-password"]!.replace("1 hour", "30 minutes"));
    unlinkSync(join(dir, "delete-account.md"));
    const r3 = await syncArticles(handle, await loadArticlesFromDir(dir));
    expect(r3).toEqual({ inserted: 0, updated: 1, unchanged: 2, removed: 1 });
    expect((await getArticle(handle.executor, "reset-password"))!.body).toContain("30 minutes");
    expect(await getArticle(handle.executor, "delete-account")).toBeNull();
    const { rows } = await handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM support_article_chunks c LEFT JOIN support_articles a ON a.id = c.article_id WHERE a.id IS NULL`);
    expect(rows[0]!.n).toBe(0); // chunks of removed articles are gone too
  });

  it("a missing content directory loads nothing; an invalid file fails loudly", async () => {
    expect(await loadArticlesFromDir(join(writeArticles({}), "nope"))).toEqual([]);
    dir = writeArticles({ broken: "---\ntitle: x\n---\nbody" });
    await expect(loadArticlesFromDir(dir)).rejects.toThrow(ArticleError);
  });
});

describe("full-text search", () => {
  let handle: DbHandle<any>;
  afterEach(async () => handle?.close());

  async function seeded() {
    handle = await makeDb();
    await syncArticles(handle, await loadArticlesFromDir(writeArticles()));
    return handle.executor;
  }

  it("ranks title matches above body-only matches and stems words", async () => {
    const ex = await seeded();
    const hits = await searchArticles(ex, "how do I cancel my subscription?");
    expect(hits[0]!.slug).toBe("cancel-subscription");
    // "plans-and-limits" mentions cancel only in its body: it may match, but ranks lower.
    const idx = hits.findIndex((h) => h.slug === "plans-and-limits");
    if (idx >= 0) expect(idx).toBeGreaterThan(0);
    expect((await searchArticles(ex, "cancellation"))[0]!.slug).toBe("cancel-subscription");
    expect((await searchArticles(ex, "forgot my password"))[0]!.slug).toBe("reset-password");
  });

  it("returns chunks for retrieval with at most two per article", async () => {
    const ex = await seeded();
    const chunks = await searchChunks(ex, "refund cancel subscription billing", 5);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.slug).toBe("cancel-subscription");
    expect(chunks.filter((c) => c.slug === "cancel-subscription").length).toBeLessThanOrEqual(2);
  });

  it("treats tsquery syntax in user input as plain words", async () => {
    const ex = await seeded();
    expect(buildTsQuery("&|!():* '")).toBeNull();
    await expect(searchArticles(ex, "password & | ! ( ) :* <-> 'x'")).resolves.toBeInstanceOf(Array);
    expect(await searchArticles(ex, "")).toEqual([]);
  });
});
