/**
 * Free-tier report lock, applied on the SERVER before a report leaves it (report page, JSON export, scan response,
 * PDF). Without `fullReport`, a viewer gets the summary (score, counts per severity and per check, pages read) and
 * the `reportIssues` most severe issues with their fixes. Every other issue, the page list and the sampled sitemap
 * URLs are removed; only counts per kind of problem are sent so the paywall can say what is locked.
 * Pure functions (no I/O) so they can be unit-tested and used in client-safe types.
 */
import type { CheckId, Issue, ScanReport, Severity } from "./scanner/types";

export interface ReportEnts {
  limits: Record<string, number>;
  features: Record<string, boolean>;
}

export interface LockedKind {
  /** Plural noun, e.g. "broken links". */
  label: string;
  count: number;
}

export interface LockedSummary {
  /** Issues in the full report. */
  total: number;
  /** Issues included in this (locked) copy. */
  shown: number;
  /** Issues withheld. */
  hidden: number;
  hiddenBySeverity: Record<Severity, number>;
  /** Withheld issues by kind, largest first. Labels only: never URLs or messages. */
  hiddenByKind: LockedKind[];
  /** Pages in the full report's page list (withheld). */
  pagesHidden: number;
}

export interface GatedReport {
  report: ScanReport;
  /** null = the viewer sees the full report. */
  locked: LockedSummary | null;
}

/** Free-tier issue count when the entitlements carry none (the catalog's free value). */
export const DEFAULT_FREE_REPORT_ISSUES = 3;

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, notice: 2 };

/** Whether these entitlements unlock the whole report. */
export function hasFullReport(ents: ReportEnts): boolean {
  return ents.features.fullReport === true || ents.limits.reportIssues === -1;
}

/** Issues listed for these entitlements (Infinity = all). */
export function issueAllowance(ents: ReportEnts): number {
  if (hasFullReport(ents)) return Number.POSITIVE_INFINITY;
  const n = ents.limits.reportIssues;
  return typeof n === "number" && n >= 0 ? n : DEFAULT_FREE_REPORT_ISSUES;
}

/** The n most severe issues; ties keep the report's order (which already lists the worst first within a check). */
export function topIssues(issues: Issue[], n: number): Issue[] {
  if (!Number.isFinite(n)) return issues.slice();
  return issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((x) => x.issue);
}

const KIND_BY_CHECK: Record<CheckId, string> = {
  status: "page errors",
  "internal-links": "internal link problems",
  "external-links": "unverified external links",
  titles: "page title problems",
  "meta-description": "meta description problems",
  canonical: "canonical URL problems",
  images: "pages with images missing alt text",
  sitemap: "sitemap problems",
  robots: "robots.txt problems",
  https: "HTTPS and certificate problems",
  "mixed-content": "mixed content problems",
  crawl: "crawl coverage notes",
};

/** Plural noun for the kind of problem an issue is (used only in counts). */
export function issueKind(issue: Pick<Issue, "id" | "check">): string {
  if (issue.id === "internal-link-broken" || issue.id === "internal-link-unreachable") return "broken links";
  if (issue.check === "external-links" && issue.id !== "external-link-unverified") return "broken links";
  if (issue.id === "internal-link-redirect" || issue.id === "redirect-chain") return "redirects";
  if (issue.id.startsWith("description-missing") || issue.id === "description-empty") return "missing meta descriptions";
  if (issue.id === "title-missing" || issue.id === "title-empty") return "missing page titles";
  return KIND_BY_CHECK[issue.check] ?? "other problems";
}

function summarize(all: Issue[], shown: Issue[], pages: number): LockedSummary {
  const shownSet = new Set(shown);
  const hiddenIssues = all.filter((i) => !shownSet.has(i));
  const hiddenBySeverity: Record<Severity, number> = { critical: 0, warning: 0, notice: 0 };
  const kinds = new Map<string, number>();
  for (const i of hiddenIssues) {
    hiddenBySeverity[i.severity]++;
    const k = issueKind(i);
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const hiddenByKind = [...kinds.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { total: all.length, shown: shown.length, hidden: hiddenIssues.length, hiddenBySeverity, hiddenByKind, pagesHidden: pages };
}

/**
 * The copy of a report a viewer with these entitlements may receive. Full access returns the report unchanged.
 * Locked copies keep the summary (score, grade, counts, checks, stats, robots/https/sitemap facts) and the top
 * issues only.
 */
export function gateReport(report: ScanReport, ents: ReportEnts): GatedReport {
  const allowance = issueAllowance(ents);
  // Nothing to withhold (fewer issues than the allowance): the whole report is the free report.
  if (!Number.isFinite(allowance) || report.issues.length <= allowance) return { report, locked: null };
  const shown = topIssues(report.issues, allowance);
  const locked = summarize(report.issues, shown, report.pages.length);
  return {
    report: {
      ...report,
      issues: shown,
      pages: [],
      sitemap: { ...report.sitemap, sampled: [] },
    },
    locked,
  };
}

const SINGULAR: Record<string, string> = {
  "broken links": "broken link",
  redirects: "redirect",
  "missing meta descriptions": "missing meta description",
  "missing page titles": "missing page title",
  "page errors": "page error",
  "internal link problems": "internal link problem",
  "unverified external links": "unverified external link",
  "page title problems": "page title problem",
  "meta description problems": "meta description problem",
  "canonical URL problems": "canonical URL problem",
  "pages with images missing alt text": "page with images missing alt text",
  "sitemap problems": "sitemap problem",
  "robots.txt problems": "robots.txt problem",
  "HTTPS and certificate problems": "HTTPS or certificate problem",
  "mixed content problems": "mixed content problem",
  "crawl coverage notes": "crawl coverage note",
  "other problems": "other problem",
};

/** "14 broken links" / "1 broken link". */
export function kindCount(k: LockedKind): string {
  return `${k.count} ${k.count === 1 ? (SINGULAR[k.label] ?? k.label) : k.label}`;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "27 more issues found on example.com, including 14 broken links." (null when nothing is hidden). */
export function lockedHeadline(locked: LockedSummary, startUrl: string): string | null {
  if (locked.hidden <= 0) return null;
  const top = locked.hiddenByKind[0];
  const base = `${plural(locked.hidden, "more issue", "more issues")} found on ${host(startUrl)}`;
  return top && locked.hiddenByKind.length > 1 ? `${base}, including ${kindCount(top)}.` : `${base}.`;
}

/** "14 broken links, 9 missing meta descriptions, 3 redirects…" (at most `max` kinds). */
export function lockedBreakdown(locked: LockedSummary, max = 4): string {
  const parts = locked.hiddenByKind.slice(0, max).map(kindCount);
  return parts.join(", ") + (locked.hiddenByKind.length > max ? "…" : "");
}
