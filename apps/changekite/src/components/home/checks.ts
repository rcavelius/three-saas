/**
 * The twelve checks in tail order (the kite's tail carries one bow per check), with a few plain words each.
 * Example results come from the labelled example report (lib/example-report.ts), so the bows can never
 * disagree with the example's issues.
 */
import type { CheckId, Severity } from "@/lib/scanner/types";
import { EXAMPLE_ISSUES } from "@/lib/example-report";

export interface TailCheck {
  id: CheckId;
  name: string;
  gloss: string;
}

export const TAIL: TailCheck[] = [
  { id: "status", name: "Page status", gloss: "Every page answers" },
  { id: "internal-links", name: "Internal links", gloss: "No dead ends inside" },
  { id: "external-links", name: "External links", gloss: "Outbound links still live" },
  { id: "titles", name: "Titles", gloss: "Each page has its own" },
  { id: "meta-description", name: "Descriptions", gloss: "The snippet under the title" },
  { id: "images", name: "Alt text", gloss: "Images described" },
  { id: "canonical", name: "Canonicals", gloss: "One true address per page" },
  { id: "sitemap", name: "Sitemap", gloss: "The list of pages to find" },
  { id: "robots", name: "robots.txt", gloss: "Crawlers let in" },
  { id: "https", name: "HTTPS", gloss: "Certificate valid, not expiring" },
  { id: "mixed-content", name: "Mixed content", gloss: "Nothing loaded over http" },
  { id: "crawl", name: "Coverage", gloss: "What we did and didn't reach" },
];

export type BowState = "pass" | Severity;

const RANK: Record<Severity, number> = { critical: 3, warning: 2, notice: 1 };

/** The worst example finding for each check, or "pass". */
export function exampleBowStates(): Record<CheckId, BowState> {
  const out = {} as Record<CheckId, BowState>;
  for (const c of TAIL) out[c.id] = "pass";
  for (const i of EXAMPLE_ISSUES) {
    const cur = out[i.check];
    if (cur === "pass" || RANK[i.severity] > RANK[cur]) out[i.check] = i.severity;
  }
  return out;
}

export const BOW_FILL: Record<BowState, string> = {
  pass: "var(--color-bow-pass)",
  notice: "var(--color-bow-notice)",
  warning: "var(--color-bow-warn)",
  critical: "var(--color-bow-fail)",
};

export const BOW_WORD: Record<BowState, string> = {
  pass: "passed",
  notice: "notice",
  warning: "warning",
  critical: "critical",
};
