import { randomBytes } from "node:crypto";
import type { SqlExecutor } from "@repo/database";
import type { ScanReport } from "./scanner/types";

/** 128-bit random, URL-safe: report links are unguessable capability URLs. */
export function newScanId(): string {
  return randomBytes(16).toString("base64url");
}

export const SCAN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export async function saveScan(ex: SqlExecutor, report: ScanReport, retentionDays: number): Promise<string> {
  const id = newScanId();
  const expires = new Date(Date.now() + retentionDays * 86_400_000);
  await ex.query(
    `INSERT INTO scans (id, url, host, score, critical, warning, notice, pages, duration_ms, report, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
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
      expires.toISOString(),
    ],
  );
  return id;
}

export async function getScan(ex: SqlExecutor, id: string): Promise<{ id: string; createdAt: string; report: ScanReport } | null> {
  if (!SCAN_ID_PATTERN.test(id)) return null;
  const { rows } = await ex.query<{ id: string; created_at: string | Date; report: ScanReport | string }>(
    `SELECT id, created_at, report FROM scans WHERE id = $1 AND expires_at > now()`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const report = typeof row.report === "string" ? (JSON.parse(row.report) as ScanReport) : row.report;
  return { id: row.id, createdAt: new Date(row.created_at).toISOString(), report };
}

export async function deleteExpiredScans(ex: SqlExecutor): Promise<number> {
  const { rows } = await ex.query<{ n: number }>(`WITH d AS (DELETE FROM scans WHERE expires_at <= now() RETURNING 1) SELECT count(*)::int AS n FROM d`);
  return Number(rows[0]?.n ?? 0);
}
