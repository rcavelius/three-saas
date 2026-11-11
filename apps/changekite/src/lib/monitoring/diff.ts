/**
 * Pure change detection for monitored sites: stable issue fingerprints, the key facts of a scan, and the
 * list of "meaningful changes" between two scans. No I/O here so every rule is unit tested.
 */
import { createHash } from "node:crypto";
import type { Issue, ScanReport, Severity } from "../scanner/types";

export interface IssueFingerprint {
  fp: string;
  ruleId: string;
  check: string;
  severity: Severity;
  message: string;
  page: string | null;
}

/**
 * Digits outside URLs are volatile ("expires in 13 days", "3 redirects", "(404)"), so they are masked;
 * URLs are kept verbatim so /post/1 and /post/2 stay different issues.
 */
export function stableMessage(message: string): string {
  return message
    .split(/(\s+)/)
    .map((tok) => (/:\/\/|^\//.test(tok) ? tok : tok.replace(/\d+/g, "#")))
    .join("")
    .trim();
}

export function fingerprintIssue(i: Pick<Issue, "id" | "page" | "message">): string {
  return createHash("sha256")
    .update(`${i.id}\u0000${i.page ?? ""}\u0000${stableMessage(i.message)}`)
    .digest("hex")
    .slice(0, 32);
}

export function fingerprintReport(report: ScanReport): IssueFingerprint[] {
  const seen = new Map<string, IssueFingerprint>();
  for (const i of report.issues) {
    const fp = fingerprintIssue(i);
    if (!seen.has(fp)) {
      seen.set(fp, { fp, ruleId: i.id, check: i.check, severity: i.severity, message: i.message.slice(0, 500), page: i.page });
    }
  }
  return [...seen.values()];
}

export interface ScanFacts {
  /** The start page answered with an HTTP status (any status). */
  reachable: boolean;
  homeStatus: number | null;
  score: number;
  certDaysRemaining: number | null;
  /** Certificate invalid, expired or expiring in < 14 days. */
  certProblem: boolean;
  robotsBlocksAll: boolean;
  critical: number;
  warning: number;
}

export function factsOf(report: ScanReport): ScanFacts {
  const start = report.pages.find((p) => p.url === report.startUrl) ?? report.pages[0];
  const tls = report.https.tls;
  const ids = new Set(report.issues.map((i) => i.id));
  return {
    // When robots.txt keeps ChangeKiteBot off the start page there is no page entry: the server still
    // answered (robots.txt), so the site is up.
    reachable: start ? start.status !== null : report.robots.status !== null,
    homeStatus: start?.status ?? null,
    score: report.score,
    certDaysRemaining: tls?.daysRemaining ?? null,
    certProblem: ids.has("tls-expiring-soon") || ids.has("tls-expired") || ids.has("tls-invalid"),
    robotsBlocksAll: report.robots.blocksAllForEveryone,
    critical: report.counts.critical,
    warning: report.counts.warning,
  };
}

export type ChangeKind =
  | "site_down"
  | "site_up"
  | "home_status"
  | "new_critical"
  | "new_broken_links"
  | "cert_expiring"
  | "robots_blocks_all"
  | "score_drop";

export interface ChangeEvent {
  kind: ChangeKind;
  /** Stable key for dedup (fingerprints + episode for issues, transition for facts). */
  key: string;
  summary: string;
  issues?: IssueFingerprint[];
}

export const SCORE_DROP_THRESHOLD = 10;

function isOk(status: number | null): boolean {
  return status !== null && status >= 200 && status < 400;
}

/**
 * Meaningful changes between the previous facts and this scan.
 * - prev === null (first scan) is a baseline: only "site down" is reported.
 * - newIssues: critical fingerprints that opened in THIS scan (not already open: no repeats).
 */
export function detectChanges(
  prev: ScanFacts | null,
  cur: ScanFacts,
  newIssues: (IssueFingerprint & { openedAt: string })[],
): ChangeEvent[] {
  const out: ChangeEvent[] = [];
  if (!prev) {
    if (!cur.reachable) out.push({ kind: "site_down", key: "down:baseline", summary: "The site could not be reached on the first scan." });
    return out;
  }
  if (prev.reachable && !cur.reachable) {
    out.push({ kind: "site_down", key: "down", summary: "The home page could not be loaded (no HTTP response)." });
  } else if (!prev.reachable && cur.reachable) {
    out.push({ kind: "site_up", key: "up", summary: `The site is reachable again (HTTP ${cur.homeStatus}).` });
  } else if (
    cur.reachable &&
    prev.homeStatus !== null &&
    cur.homeStatus !== null &&
    prev.homeStatus !== cur.homeStatus &&
    isOk(prev.homeStatus) !== isOk(cur.homeStatus)
  ) {
    out.push({
      kind: "home_status",
      key: `status:${prev.homeStatus}->${cur.homeStatus}`,
      summary: `The home page now returns HTTP ${cur.homeStatus} (was ${prev.homeStatus}).`,
    });
  }
  const broken = newIssues.filter((i) => i.ruleId === "internal-link-broken");
  const otherCritical = newIssues.filter((i) => i.severity === "critical" && i.ruleId !== "internal-link-broken" && !i.ruleId.startsWith("tls-"));
  if (broken.length) {
    out.push({
      kind: "new_broken_links",
      key: "broken:" + broken.map((i) => `${i.fp}@${i.openedAt}`).sort().join(","),
      summary: `${broken.length} new broken internal link${broken.length === 1 ? "" : "s"}.`,
      issues: broken,
    });
  }
  if (otherCritical.length) {
    out.push({
      kind: "new_critical",
      key: "critical:" + otherCritical.map((i) => `${i.fp}@${i.openedAt}`).sort().join(","),
      summary: `${otherCritical.length} new critical issue${otherCritical.length === 1 ? "" : "s"}.`,
      issues: otherCritical,
    });
  }
  if (!prev.certProblem && cur.certProblem) {
    out.push({
      kind: "cert_expiring",
      key: "cert",
      summary:
        cur.certDaysRemaining !== null && cur.certDaysRemaining >= 0
          ? `The TLS certificate expires in ${cur.certDaysRemaining} days, or is no longer trusted.`
          : "The TLS certificate has expired or is not trusted.",
    });
  }
  if (!prev.robotsBlocksAll && cur.robotsBlocksAll) {
    out.push({ kind: "robots_blocks_all", key: "robots", summary: "robots.txt now blocks the whole site for every crawler, including search engines." });
  }
  if (prev.reachable && cur.reachable && prev.score - cur.score >= SCORE_DROP_THRESHOLD) {
    out.push({ kind: "score_drop", key: `score:${prev.score}->${cur.score}`, summary: `The score dropped from ${prev.score} to ${cur.score}.` });
  }
  return out;
}

/** Dedup key for one change set (sorted, hashed). */
export function changeSetKey(siteId: string, kind: string, keys: string[]): string {
  return createHash("sha256").update(`${siteId}|${kind}|${[...keys].sort().join("|")}`).digest("hex").slice(0, 40);
}
