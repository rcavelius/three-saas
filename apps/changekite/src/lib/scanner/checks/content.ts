/** Title, meta description and image alt checks. Pure functions over crawled pages. */
import type { CrawledPage, Issue } from "../types";
import { truncate } from "../url-utils";
import { isNoindex } from "../html";

export const TITLE_MAX = 60;
export const TITLE_MIN = 10;
export const DESC_MIN = 50;
export const DESC_MAX = 160;

/** Pages whose content checks are meaningful: successfully fetched HTML on the site. */
export function contentPages(pages: CrawledPage[]): CrawledPage[] {
  return pages.filter((p) => p.parsed && p.status !== null && p.status >= 200 && p.status < 300);
}

function listPages(urls: string[], max = 5): string {
  const shown = urls.slice(0, max).join(", ");
  return urls.length > max ? `${shown} and ${urls.length - max} more` : shown;
}

export function checkTitles(pages: CrawledPage[]): Issue[] {
  const issues: Issue[] = [];
  const byTitle = new Map<string, string[]>();
  for (const p of contentPages(pages)) {
    const t = p.parsed!.title;
    if (t === null) {
      issues.push({
        id: "title-missing",
        check: "titles",
        severity: "critical",
        page: p.finalUrl,
        message: "Page has no <title> element",
        howToFix: "Add a unique, descriptive <title> inside <head>. It is the clickable headline in search results and the browser tab label.",
      });
      continue;
    }
    if (t === "") {
      issues.push({
        id: "title-empty",
        check: "titles",
        severity: "critical",
        page: p.finalUrl,
        message: "The <title> element is empty",
        howToFix: "Write a title that says what this page is about, ideally 30–60 characters.",
      });
      continue;
    }
    if (p.parsed!.titleCount > 1) {
      issues.push({
        id: "title-multiple",
        check: "titles",
        severity: "warning",
        page: p.finalUrl,
        message: `Page has ${p.parsed!.titleCount} <title> elements`,
        detail: "Browsers and search engines use only the first; the rest are usually left over from a template or plugin.",
        howToFix: "Keep exactly one <title> in <head> and remove the others.",
      });
    }
    if (t.length > TITLE_MAX) {
      issues.push({
        id: "title-too-long",
        check: "titles",
        severity: "notice",
        page: p.finalUrl,
        message: `Title is ${t.length} characters; search results usually cut off around ${TITLE_MAX}`,
        detail: `“${truncate(t, 120)}”`,
        howToFix: "Put the most important words first and trim the rest, e.g. drop a repeated site name or slogan.",
      });
    } else if (t.length < TITLE_MIN) {
      issues.push({
        id: "title-too-short",
        check: "titles",
        severity: "notice",
        page: p.finalUrl,
        message: `Title is only ${t.length} characters`,
        detail: `“${t}”`,
        howToFix: "Describe the page more specifically so it stands out in search results and browser tabs.",
      });
    }
    if (!isNoindex(p.parsed!.robotsDirectives)) {
      const key = t.toLowerCase();
      byTitle.set(key, [...(byTitle.get(key) ?? []), p.finalUrl]);
    }
  }
  for (const [, urls] of byTitle) {
    if (urls.length < 2) continue;
    const title = contentPages(pages).find((p) => p.finalUrl === urls[0])!.parsed!.title!;
    issues.push({
      id: "title-duplicate",
      check: "titles",
      severity: "warning",
      page: urls[0]!,
      message: `${urls.length} pages share the title “${truncate(title, 80)}”`,
      detail: `Pages: ${listPages(urls)}`,
      howToFix: "Give each page its own title that reflects its content. Duplicate titles make pages compete with each other in search.",
    });
  }
  return issues;
}

export function checkMetaDescriptions(pages: CrawledPage[]): Issue[] {
  const issues: Issue[] = [];
  const byDesc = new Map<string, string[]>();
  for (const p of contentPages(pages)) {
    const d = p.parsed!.metaDescription;
    if (d === null) {
      issues.push({
        id: "description-missing",
        check: "meta-description",
        severity: "warning",
        page: p.finalUrl,
        message: "No meta description",
        howToFix: 'Add <meta name="description" content="…"> with a one- or two-sentence summary (about 70–160 characters). Search engines often show it under the title.',
      });
      continue;
    }
    if (d === "") {
      issues.push({
        id: "description-empty",
        check: "meta-description",
        severity: "warning",
        page: p.finalUrl,
        message: "Meta description is empty",
        howToFix: "Fill in the content attribute with a short summary of the page, or remove the empty tag.",
      });
      continue;
    }
    if (p.parsed!.metaDescriptionCount > 1) {
      issues.push({
        id: "description-multiple",
        check: "meta-description",
        severity: "notice",
        page: p.finalUrl,
        message: `Page has ${p.parsed!.metaDescriptionCount} meta descriptions`,
        howToFix: "Keep a single meta description; a theme and an SEO plugin often both add one.",
      });
    }
    if (d.length < DESC_MIN) {
      issues.push({
        id: "description-too-short",
        check: "meta-description",
        severity: "notice",
        page: p.finalUrl,
        message: `Meta description is only ${d.length} characters`,
        detail: `“${d}”`,
        howToFix: "Expand it into a useful summary that gives searchers a reason to click.",
      });
    } else if (d.length > DESC_MAX) {
      issues.push({
        id: "description-too-long",
        check: "meta-description",
        severity: "notice",
        page: p.finalUrl,
        message: `Meta description is ${d.length} characters; it will likely be cut off around ${DESC_MAX}`,
        detail: `“${truncate(d, 200)}”`,
        howToFix: "Lead with the key message and keep it under about 160 characters.",
      });
    }
    if (!isNoindex(p.parsed!.robotsDirectives)) {
      const key = d.toLowerCase();
      byDesc.set(key, [...(byDesc.get(key) ?? []), p.finalUrl]);
    }
  }
  for (const [, urls] of byDesc) {
    if (urls.length < 2) continue;
    issues.push({
      id: "description-duplicate",
      check: "meta-description",
      severity: "warning",
      page: urls[0]!,
      message: `${urls.length} pages share the same meta description`,
      detail: `Pages: ${listPages(urls)}`,
      howToFix: "Write a distinct description for each page, or remove it on pages where you cannot, so search engines generate one from the content.",
    });
  }
  return issues;
}

export function checkImages(pages: CrawledPage[]): Issue[] {
  const issues: Issue[] = [];
  for (const p of contentPages(pages)) {
    const missing = p.parsed!.images.filter((i) => i.alt === null);
    if (missing.length === 0) continue;
    const srcs = [...new Set(missing.map((i) => i.src || "(no src)"))];
    issues.push({
      id: "img-alt-missing",
      check: "images",
      severity: "warning",
      page: p.finalUrl,
      message: `${missing.length} image${missing.length === 1 ? "" : "s"} without an alt attribute`,
      detail: `Images: ${listPages(srcs, 4)}`,
      howToFix:
        'Add alt text that describes what the image shows or does. For purely decorative images use an empty alt="" so screen readers skip them; leaving alt out makes screen readers read the file name.',
    });
  }
  return issues;
}
