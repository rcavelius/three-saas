/**
 * A deliberately small Markdown subset parsed into a plain AST. The UI renders the AST as React elements
 * (never as an HTML string), so raw HTML in an article can only ever appear as literal text.
 *
 * Blocks: `## ` / `### ` headings, paragraphs, `- ` / `* ` bullet lists, `1. ` numbered lists, fenced code.
 * Inline: **bold**, *italic*, `code`, [text](href) with href limited to /relative, #anchor or http(s).
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; id: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "code"; text: string };

export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^\/(?!\/)[^\s]*$/.test(h) || /^#[\w-]+$/.test(h)) return h;
  try {
    const u = new URL(h);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function slugifyHeading(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "section"
  );
}

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[" && depth < 2) {
      const close = src.indexOf("]", i + 1);
      if (close > i && src[close + 1] === "(") {
        const paren = src.indexOf(")", close + 2);
        if (paren > close) {
          const text = src.slice(i + 1, close);
          const href = safeHref(src.slice(close + 2, paren));
          flush();
          if (href) out.push({ type: "link", href, children: parseInline(text, depth + 1) });
          else out.push(...parseInline(text, depth + 1));
          i = paren + 1;
          continue;
        }
      }
    }
    if (ch === "*" && src[i + 1] === "*" && depth < 3) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if ((ch === "*" || ch === "_") && depth < 3 && src[i + 1] !== " " && (ch === "*" || i === 0 || /\W/.test(src[i - 1]!))) {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && src[end - 1] !== " " && (ch === "*" || end + 1 >= src.length || /\W/.test(src[end + 1]!))) {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Set<string>();
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", children: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map((t) => parseInline(t)) });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line.trim())) {
      flushPara();
      flushList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) code.push(lines[i++]!);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1]!.length <= 2 ? 2 : 3;
      let id = slugifyHeading(h[2]!);
      for (let n = 2; usedIds.has(id); n++) id = `${slugifyHeading(h[2]!)}-${n}`;
      usedIds.add(id);
      blocks.push({ type: "heading", level, id, children: parseInline(h[2]!.trim()) });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!.trim());
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // continuation of the previous list item
      list.items[list.items.length - 1] += " " + line.trim();
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.type === "text" || n.type === "code" ? n.text : inlineText(n.children)))
    .join("");
}

/** Markdown -> plain text (for search vectors, chunking and AI excerpts). */
export function markdownToText(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      if (b.type === "code") return b.text;
      if (b.type === "list") return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${inlineText(it)}`).join("\n");
      return inlineText(b.children);
    })
    .join("\n\n");
}
