import type { CrawledPage, Issue } from "../types";
import { contentPages } from "./content";

export function checkMixedContent(pages: CrawledPage[]): Issue[] {
  const issues: Issue[] = [];
  for (const p of contentPages(pages)) {
    if (!p.finalUrl.startsWith("https:")) continue;
    const insecure = p.parsed!.subresources.filter((s) => s.url.startsWith("http:"));
    if (!insecure.length) continue;
    const active = insecure.filter((s) => s.kind === "active");
    const passive = insecure.filter((s) => s.kind === "passive");
    const forms = insecure.filter((s) => s.kind === "form");
    const fmt = (list: typeof insecure) =>
      [...new Set(list.map((s) => `${s.tag}: ${s.url}`))].slice(0, 5).join("; ") + (list.length > 5 ? ` (+${list.length - 5} more)` : "");
    if (active.length) {
      issues.push({
        id: "mixed-content-active",
        check: "mixed-content",
        severity: "critical",
        page: p.finalUrl,
        message: `${active.length} script/stylesheet/frame resource${active.length === 1 ? "" : "s"} loaded over http://`,
        detail: fmt(active),
        howToFix: "Browsers block these on HTTPS pages, so the page can break. Change the URLs to https:// (or a relative URL) and make sure the resource is available over HTTPS.",
      });
    }
    if (passive.length) {
      issues.push({
        id: "mixed-content-passive",
        check: "mixed-content",
        severity: "warning",
        page: p.finalUrl,
        message: `${passive.length} image/media resource${passive.length === 1 ? "" : "s"} loaded over http://`,
        detail: fmt(passive),
        howToFix: "Switch these URLs to https://. Browsers upgrade or block them and may show the page as not fully secure.",
      });
    }
    if (forms.length) {
      issues.push({
        id: "mixed-content-form",
        check: "mixed-content",
        severity: "critical",
        page: p.finalUrl,
        message: "A form submits to an http:// URL",
        detail: fmt(forms),
        howToFix: "Form data would travel unencrypted. Point the form action at an https:// URL.",
      });
    }
  }
  return issues;
}
