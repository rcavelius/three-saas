import { randomBytes } from "node:crypto";
import type { SqlExecutor } from "@repo/database";
import type { ScanReport } from "./scanner/types";
import { factsOf, fingerprintReport, type IssueFingerprint } from "./monitoring/diff";

/** 128-bit random, URL-safe: report links are unguessable capability URLs. */
export function newScanId(): string {
  return randomBytes(16).toString("base64url");
}

export const SCAN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const DAY_MS = 86_400_000;

export interface SaveScanOptions {
  /** Anonymous scans: days until the link expires. */
  retentionDays?: number;
  /** Account scans: owning org + site, expiry computed by the caller from plan historyDays. */
  orgId?: string;
  siteId?: string;
  expiresAt?: Date;
  now?: Date;
}

export async function saveScan(ex: SqlExecutor, report: ScanReport, retentionDaysOrOpts: number | SaveScanOptions): Promise<string> {
  const o: SaveScanOptions = typeof retentionDaysOrOpts === "number" ? { retentionDays: retentionDaysOrOpts } : retentionDaysOrOpts;
  const id = newScanId();
  const now = o.now ?? new Date();
  const expires = o.expiresAt ?? new Date(now.getTime() + (o.retentionDays ?? 90) * DAY_MS);
  const facts = factsOf(report);
  const fps = o.orgId ? fingerprintReport(report) : null;
  await ex.query(
    `INSERT INTO scans (id, url, host, score, critical, warning, notice, pages, duration_ms, report, created_at, expires_at,
       org_id, site_id, home_status, reachable, fingerprints)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb)`,
    [
      id,
      report.startUrl,
      new URL(report.startUrl).hostname,
      report.score,
      report.counts.critical,
      report.counts.warning,
      report.counts.notice,
      report.stats.pagesCrawled,
      report.durationMs,
      JSON.stringify(report),
      now.toISOString(),
      expires.toISOString(),
      o.orgId ?? null,
      o.siteId ?? null,
      facts.homeStatus,
      facts.reachable,
      fps ? JSON.stringify(fps) : null,
    ],
  );
  return id;
}

export interface StoredScan {
  id: string;
  createdAt: string;
  orgId: string | null;
  siteId: string | null;
  report: ScanReport;
}

/**
 * Loads a scan by id WITHOUT any access decision. Callers must apply `canView` rules:
 * anonymous scans (org_id NULL) are capability links; account scans need org membership.
 */
export async function getScan(ex: SqlExecutor, id: string, now: Date = new Date()): Promise<StoredScan | null> {
  if (!SCAN_ID_PATTERN.test(id)) return null;
  const { rows } = await ex.query<{ id: string; created_at: string | Date; report: ScanReport | string; org_id: string | null; site_id: string | null }>(
    `SELECT id, created_at, report, org_id, site_id::text AS site_id FROM scans WHERE id = $1 AND expires_at > $2`,
    [id, now.toISOString()],
  );
  const row = rows[0];
  if (!row) return null;
  const report = typeof row.report === "string" ? (JSON.parse(row.report) as ScanReport) : row.report;
  return { id: row.id, createdAt: new Date(row.created_at).toISOString(), orgId: row.org_id, siteId: row.site_id, report };
}

export interface ScanSummaryRow {
  id: string;
  createdAt: string;
  score: number;
  critical: number;
  warning: number;
  notice: number;
  pages: number;
  homeStatus: number | null;
  reachable: boolean | null;
}

export async function listSiteScans(ex: SqlExecutor, orgId: string, siteId: string, limit = 30): Promise<ScanSummaryRow[]> {
  const { rows } = await ex.query<Record<string, unknown>>(
    `SELECT id, created_at, score, critical, warning, notice, pages, home_status, reachable FROM scans
     WHERE org_id = $1 AND site_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [orgId, siteId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: new Date(r.created_at as string).toISOString(),
    score: Number(r.score),
    critical: Number(r.critical),
    warning: Number(r.warning),
    notice: Number(r.notice),
    pages: Number(r.pages),
    homeStatus: r.home_status === null ? null : Number(r.home_status),
    reachable: r.reachable === null ? null : Boolean(r.reachable),
  }));
}

export async function getScanFingerprints(ex: SqlExecutor, orgId: string, scanId: string): Promise<IssueFingerprint[] | null> {
  const { rows } = await ex.query<{ fingerprints: IssueFingerprint[] | string | null }>(
    `SELECT fingerprints FROM scans WHERE org_id = $1 AND id = $2`,
    [orgId, scanId],
  );
  if (!rows[0]) return null;
  const f = rows[0].fingerprints;
  return f ? (typeof f === "string" ? (JSON.parse(f) as IssueFingerprint[]) : f) : [];
}

/**
 * Deletes expired scans in batches. The latest scan of every monitored site is kept even when expired
 * (the dashboard needs a current state; it is replaced by the next scan).
 */
export async function deleteExpiredScans(
  ex: SqlExecutor,
  opts: { now?: Date; batchSize?: number; maxBatches?: number } = {},
): Promise<number> {
  const now = (opts.now ?? new Date()).toISOString();
  const batch = opts.batchSize ?? 500;
  const maxBatches = opts.maxBatches ?? 20;
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const { rows } = await ex.query<{ n: number }>(
      `WITH victims AS (
         SELECT s.id FROM scans s
         WHERE s.expires_at <= $1
           AND NOT EXISTS (SELECT 1 FROM sites t WHERE t.last_scan_id = s.id)
         LIMIT $2
       ), d AS (DELETE FROM scans WHERE id IN (SELECT id FROM victims) RETURNING 1)
       SELECT count(*)::int AS n FROM d`,
      [now, batch],
    );
    const n = Number(rows[0]?.n ?? 0);
    total += n;
    if (n < batch) break;
  }
  return total;
}
