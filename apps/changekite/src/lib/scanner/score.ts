import type { CheckId, CheckStatus, CheckSummary, Issue, Severity } from "./types";

/**
 * Transparent score, shown verbatim on the report:
 *   100 − 10 per critical (max 60) − 3 per warning (max 30) − 1 per notice (max 10), never below 0.
 * Every deduction is capped so one noisy category cannot hide everything else.
 */
export const SCORE_RULES = {
  critical: { points: 10, cap: 60 },
  warning: { points: 3, cap: 30 },
  notice: { points: 1, cap: 10 },
} as const;

export function countBySeverity(issues: Issue[]): Record<Severity, number> {
  const c: Record<Severity, number> = { critical: 0, warning: 0, notice: 0 };
  for (const i of issues) c[i.severity]++;
  return c;
}

export function computeScore(issues: Issue[]): { score: number; grade: "good" | "fair" | "poor"; counts: Record<Severity, number> } {
  return scoreFromCounts(countBySeverity(issues));
}

/** The same formula from severity counts alone (used by the home page's score explainer). */
export function scoreFromCounts(counts: Record<Severity, number>): { score: number; grade: "good" | "fair" | "poor"; counts: Record<Severity, number> } {
  let score = 100;
  for (const sev of ["critical", "warning", "notice"] as const) {
    score -= Math.min(SCORE_RULES[sev].cap, counts[sev] * SCORE_RULES[sev].points);
  }
  score = Math.max(0, Math.round(score));
  const grade = counts.critical === 0 && score >= 85 ? "good" : score >= 60 ? "fair" : "poor";
  return { score, grade, counts };
}

export const CHECK_LABELS: Record<CheckId, string> = {
  status: "Page status",
  "internal-links": "Internal links",
  "external-links": "External links",
  titles: "Page titles",
  "meta-description": "Meta descriptions",
  canonical: "Canonical URLs",
  images: "Image alt text",
  sitemap: "XML sitemap",
  robots: "robots.txt",
  https: "HTTPS & certificate",
  "mixed-content": "Mixed content",
  crawl: "Crawl coverage",
};

export const CHECK_ORDER: CheckId[] = [
  "https",
  "status",
  "internal-links",
  "titles",
  "meta-description",
  "canonical",
  "images",
  "mixed-content",
  "sitemap",
  "robots",
  "external-links",
  "crawl",
];

export function summarizeChecks(issues: Issue[], notes: Partial<Record<CheckId, string>>, skipped: CheckId[] = []): CheckSummary[] {
  return CHECK_ORDER.map((id) => {
    const mine = issues.filter((i) => i.check === id);
    const counts = countBySeverity(mine);
    let status: CheckStatus = counts.critical ? "fail" : counts.warning ? "warn" : counts.notice ? "info" : "pass";
    if (skipped.includes(id) && mine.length === 0) status = "skipped";
    if (id === "crawl" && status === "pass") status = "info";
    const parts: string[] = [];
    if (counts.critical) parts.push(`${counts.critical} critical`);
    if (counts.warning) parts.push(`${counts.warning} warning${counts.warning === 1 ? "" : "s"}`);
    if (counts.notice) parts.push(`${counts.notice} notice${counts.notice === 1 ? "" : "s"}`);
    const summary = [notes[id], parts.length ? parts.join(", ") : status === "skipped" ? "Not checked" : "No problems found"]
      .filter(Boolean)
      .join(" · ");
    return { id, label: CHECK_LABELS[id], status, counts, summary };
  });
}
