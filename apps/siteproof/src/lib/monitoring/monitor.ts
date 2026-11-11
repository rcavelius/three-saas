/**
 * Recurring monitoring: scheduling due sites, running a site scan as a queue job, recording issue
 * episodes, detecting meaningful changes and creating alert rows (emailed by alerts.ts).
 *
 * Politeness/safety across ALL orgs:
 *  - global concurrency: DB leases in `scan_leases` (MONITOR_GLOBAL_CONCURRENCY slots, every instance)
 *  - per target host: at most MONITOR_HOST_SCANS_PER_HOUR scheduled scans per host per hour
 *  - all network access goes through the scanner's safeFetch deps (public addresses only)
 * A job that cannot get a slot or is host-limited re-enqueues itself for later (not a failure).
 */
import { enqueueJob, rateLimit, type DbHandle, type SqlExecutor } from "@repo/database";
import type { Billing, Entitlements } from "@repo/billing";
import { PermanentJobError, type JobContext, type JobHandler } from "@repo/ops";
import type { Logger } from "@repo/monitoring";
import { runScan } from "../scanner/scan";
import type { ScanDeps, ScanReport } from "../scanner/types";
import { hashKey } from "../scan-handler";
import { saveScan } from "../scans-repo";
import { changeSetKey, detectChanges, factsOf, fingerprintReport, type ChangeEvent, type IssueFingerprint, type ScanFacts } from "./diff";
import { isUuid } from "./sites";

export const SCAN_SITE_QUEUE = "scan.site";
export const FAILURES_BEFORE_UNREACHABLE = 3;
const DAY_MS = 86_400_000;

export interface MonitorDeps {
  handle: DbHandle<any>;
  billing: Billing;
  scanDeps: () => ScanDeps;
  logger?: Logger;
  globalConcurrency: number;
  hostScansPerHour: number;
  now?: () => Date;
  /** Overrides plan-derived scanner limits (tests: no politeness delay). */
  scanLimitOverrides?: { delayMs?: number; timeBudgetMs?: number };
}

const clock = (d: MonitorDeps) => (d.now ?? (() => new Date()))();

/** Crawl time budget grows with the plan's page cap (the report says when it was not enough). */
export function timeBudgetFor(pagesPerScan: number): number {
  return Math.min(150_000, Math.max(45_000, 45_000 + pagesPerScan * 100));
}

// -------------------------------------------------------------------------------------------------
// Leases (global concurrency cap)

export async function acquireLease(ex: SqlExecutor, cap: number, holder: string, now: Date, ttlMs: number): Promise<number | null> {
  const { rows } = await ex.query<{ slot: number }>(
    `WITH free AS (
       SELECT s FROM generate_series(0, $3::int - 1) AS s
       WHERE NOT EXISTS (SELECT 1 FROM scan_leases l WHERE l.slot = s AND l.expires_at > $4::timestamptz)
       ORDER BY s LIMIT 1
     )
     INSERT INTO scan_leases (slot, holder, expires_at) SELECT s, $1, $2::timestamptz FROM free
     ON CONFLICT (slot) DO UPDATE SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
       WHERE scan_leases.expires_at <= $4::timestamptz
     RETURNING slot`,
    [holder, new Date(now.getTime() + ttlMs).toISOString(), cap, now.toISOString()],
  );
  return rows[0] ? Number(rows[0].slot) : null;
}

export async function releaseLease(ex: SqlExecutor, slot: number, holder: string): Promise<void> {
  await ex.query(`DELETE FROM scan_leases WHERE slot = $1 AND holder = $2`, [slot, holder]);
}

// -------------------------------------------------------------------------------------------------
// Scheduling

async function hasPendingScan(ex: SqlExecutor, siteId: string): Promise<boolean> {
  const { rows } = await ex.query(
    `SELECT 1 FROM jobs WHERE queue = $1 AND status IN ('queued', 'running') AND payload->>'siteId' = $2 LIMIT 1`,
    [SCAN_SITE_QUEUE, siteId],
  );
  return rows.length > 0;
}

/** Priority queue: the claim order is run_at, so priority orgs are enqueued with an earlier run_at. */
function runAtFor(ents: Entitlements, now: Date): Date {
  return ents.features.priorityQueue ? new Date(now.getTime() - 15 * 60_000) : now;
}

export async function scheduleDueSites(d: MonitorDeps): Promise<{ enqueued: number; skipped: number }> {
  const now = clock(d);
  const entCache = new Map<string, Entitlements>();
  const ents = async (orgId: string) => {
    if (!entCache.has(orgId)) entCache.set(orgId, await d.billing.getEntitlements(orgId));
    return entCache.get(orgId)!;
  };
  const { rows: due } = await d.handle.executor.query<{ id: string; org_id: string }>(
    `SELECT id::text AS id, org_id FROM sites
     WHERE paused = false AND plan_locked = false AND (next_scan_at IS NULL OR next_scan_at <= $1)
     ORDER BY next_scan_at NULLS FIRST LIMIT 200`,
    [now.toISOString()],
  );
  let enqueued = 0;
  let skipped = 0;
  for (const s of due) {
    const e = await ents(s.org_id);
    const freq = e.limits.scanFrequencyHours ?? 0;
    if (!e.features.scheduledScans || freq <= 0) {
      skipped++;
      continue; // sites.enforce_limits locks these
    }
    const did = await d.handle.transaction(async (tx) => {
      // Row lock: concurrent schedulers on other instances skip this site.
      const { rows } = await tx.query(
        `SELECT 1 FROM sites WHERE id = $1 AND (next_scan_at IS NULL OR next_scan_at <= $2) FOR UPDATE SKIP LOCKED`,
        [s.id, now.toISOString()],
      );
      if (!rows.length) return false;
      await tx.query(`UPDATE sites SET next_scan_at = $2 WHERE id = $1`, [s.id, new Date(now.getTime() + freq * 3_600_000).toISOString()]);
      if (await hasPendingScan(tx, s.id)) return false;
      await enqueueJob(tx, SCAN_SITE_QUEUE, { siteId: s.id }, { runAt: runAtFor(e, now), maxAttempts: FAILURES_BEFORE_UNREACHABLE });
      return true;
    });
    if (did) enqueued++;
    else skipped++;
  }
  return { enqueued, skipped };
}

/** "Scan now" from the dashboard (already org-checked by the caller). */
export async function requestScanNow(
  d: Pick<MonitorDeps, "handle" | "billing" | "now">,
  orgId: string,
  siteId: string,
): Promise<"queued" | "already_queued" | "rate_limited" | "not_found" | "inactive"> {
  if (!isUuid(siteId)) return "not_found";
  const ex = d.handle.executor;
  const now = (d.now ?? (() => new Date()))();
  const { rows } = await ex.query<{ paused: boolean; plan_locked: boolean }>(
    `SELECT paused, plan_locked FROM sites WHERE org_id = $1 AND id = $2`,
    [orgId, siteId],
  );
  const site = rows[0];
  if (!site) return "not_found";
  if (site.paused || site.plan_locked) return "inactive";
  if (await hasPendingScan(ex, siteId)) return "already_queued";
  const rl = await rateLimit(ex, `manual-scan:${siteId}`, 3, 3_600_000, now);
  if (!rl.allowed) return "rate_limited";
  const e = await d.billing.getEntitlements(orgId);
  await enqueueJob(ex, SCAN_SITE_QUEUE, { siteId, manual: true }, { runAt: runAtFor(e, now), maxAttempts: FAILURES_BEFORE_UNREACHABLE });
  return "queued";
}

// -------------------------------------------------------------------------------------------------
// Running one site scan

interface SiteForScan {
  id: string;
  org_id: string;
  url: string;
  host: string;
  paused: boolean;
  plan_locked: boolean;
  consecutive_failures: number;
  last_facts: ScanFacts | string | null;
}

function parseFacts(v: ScanFacts | string | null): ScanFacts | null {
  if (!v) return null;
  return typeof v === "string" ? (JSON.parse(v) as ScanFacts) : v;
}

export interface SiteScanOutcome {
  status: "scanned" | "skipped" | "deferred" | "failed_retrying" | "unreachable";
  scanId?: string;
  alerts?: number;
}

export async function runSiteScanJob(d: MonitorDeps, payload: Record<string, unknown>, ctx: Pick<JobContext, "jobId" | "isFinalAttempt">): Promise<SiteScanOutcome> {
  const siteId = typeof payload.siteId === "string" ? payload.siteId : "";
  if (!isUuid(siteId)) throw new PermanentJobError("scan.site without a valid siteId");
  const ex = d.handle.executor;
  const now = clock(d);
  const { rows } = await ex.query<SiteForScan>(
    `SELECT id::text AS id, org_id, url, host, paused, plan_locked, consecutive_failures, last_facts FROM sites WHERE id = $1`,
    [siteId],
  );
  const site = rows[0];
  if (!site || site.paused || site.plan_locked) return { status: "skipped" };
  const ents = await d.billing.getEntitlements(site.org_id);
  if (!ents.features.scheduledScans || (ents.limits.sites ?? 0) === 0) return { status: "skipped" };

  const pages = Math.max(1, ents.limits.pagesPerScan ?? 25);
  const budget = d.scanLimitOverrides?.timeBudgetMs ?? timeBudgetFor(pages);
  const holder = `job:${ctx.jobId}`;
  const slot = await acquireLease(ex, d.globalConcurrency, holder, now, budget + 60_000);
  if (slot === null) {
    await enqueueJob(ex, SCAN_SITE_QUEUE, payload, { runAt: new Date(now.getTime() + 60_000), maxAttempts: FAILURES_BEFORE_UNREACHABLE });
    return { status: "deferred" };
  }
  let report: ScanReport | null = null;
  let scanError: string | null = null;
  try {
    const hostLimit = await rateLimit(ex, `monitor:host:${hashKey(site.host)}`, d.hostScansPerHour, 3_600_000, now);
    if (!hostLimit.allowed) {
      await enqueueJob(ex, SCAN_SITE_QUEUE, payload, { runAt: hostLimit.resetAt, maxAttempts: FAILURES_BEFORE_UNREACHABLE });
      return { status: "deferred" };
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), budget + 20_000);
    try {
      report = await runScan(site.url, d.scanDeps(), {
        limits: { maxPages: pages, timeBudgetMs: budget, ...(d.scanLimitOverrides?.delayMs !== undefined ? { delayMs: d.scanLimitOverrides.delayMs } : {}) },
        signal: abort.signal,
      });
    } catch (err) {
      scanError = err instanceof Error ? err.message.slice(0, 300) : "scan failed";
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await releaseLease(ex, slot, holder);
  }

  const facts = report ? factsOf(report) : null;
  if (!report || !facts!.reachable) {
    const reason = scanError ?? report?.pages[0]?.error ?? "The home page did not respond";
    const { rows: f } = await ex.query<{ consecutive_failures: number }>(
      `UPDATE sites SET consecutive_failures = consecutive_failures + 1, last_error = $2 WHERE id = $1 RETURNING consecutive_failures`,
      [site.id, reason.slice(0, 300)],
    );
    const failures = Number(f[0]?.consecutive_failures ?? 1);
    if (failures < FAILURES_BEFORE_UNREACHABLE && !ctx.isFinalAttempt) {
      d.logger?.warn("site scan failed, will retry", { siteId: site.id, failures });
      throw new Error(`site unreachable (attempt ${failures}); retrying with backoff`);
    }
    if (!report) {
      const alerts = await recordUnreachableWithoutReport(d, site, now, reason);
      return { status: "unreachable", alerts };
    }
  }
  const r = await persistSiteScan(d, site, report!, ents, now);
  return { status: facts!.reachable ? "scanned" : "unreachable", scanId: r.scanId, alerts: r.alerts };
}

async function recordUnreachableWithoutReport(d: MonitorDeps, site: SiteForScan, now: Date, reason: string): Promise<number> {
  return d.handle.transaction(async (tx) => {
    const { rows } = await tx.query<{ last_facts: ScanFacts | string | null }>(`SELECT last_facts FROM sites WHERE id = $1 FOR UPDATE`, [site.id]);
    const prev = parseFacts(rows[0]?.last_facts ?? null);
    const facts: ScanFacts = { ...(prev ?? { score: 0, certDaysRemaining: null, certProblem: false, robotsBlocksAll: false, critical: 0, warning: 0 }), reachable: false, homeStatus: null };
    await tx.query(`UPDATE sites SET status = 'unreachable', last_facts = $2::jsonb, last_error = $3 WHERE id = $1`, [site.id, JSON.stringify(facts), reason.slice(0, 300)]);
    if (prev && !prev.reachable) return 0;
    const ev: ChangeEvent = { kind: "site_down", key: "down", summary: `The site could not be scanned ${FAILURES_BEFORE_UNREACHABLE} times in a row: ${reason.slice(0, 200)}` };
    return insertChangeAlert(tx, site, null, [ev], now);
  });
}

async function insertChangeAlert(tx: SqlExecutor, site: { id: string; org_id: string; url: string }, scanId: string | null, events: ChangeEvent[], now: Date): Promise<number> {
  if (!events.length) return 0;
  const keys = events.map((e) => (e.issues ? e.key : `${e.key}@${scanId ?? now.toISOString()}`));
  const kinds = events.map((e) => e.kind);
  const title =
    kinds.includes("site_down")
      ? "Site unreachable"
      : kinds.includes("site_up") && events.length === 1
        ? "Site is back up"
        : events.length === 1
          ? events[0]!.summary.replace(/\.$/, "")
          : `${events.length} changes need attention`;
  const details = {
    siteUrl: site.url,
    events: events.map((e) => ({
      kind: e.kind,
      summary: e.summary,
      issues: (e.issues ?? []).slice(0, 25).map((i) => ({ message: i.message, page: i.page, severity: i.severity, fp: i.fp })),
    })),
  };
  const { rows } = await tx.query(
    `INSERT INTO alerts (org_id, site_id, scan_id, kind, dedup_key, title, details, created_at)
     VALUES ($1, $2, $3, 'change', $4, $5, $6::jsonb, $7) ON CONFLICT (site_id, dedup_key) DO NOTHING RETURNING id`,
    [site.org_id, site.id, scanId, changeSetKey(site.id, "change", keys), title.slice(0, 200), JSON.stringify(details), now.toISOString()],
  );
  return rows.length;
}

/** Saves the scan, updates issue episodes, site state and alert rows in ONE transaction (retry-safe). */
export async function persistSiteScan(
  d: Pick<MonitorDeps, "handle">,
  site: Pick<SiteForScan, "id" | "org_id" | "url">,
  report: ScanReport,
  ents: Entitlements,
  now: Date,
): Promise<{ scanId: string; alerts: number; opened: number; resolved: number }> {
  return d.handle.transaction(async (tx) => {
    const { rows: siteRows } = await tx.query<{ last_facts: ScanFacts | string | null; consecutive_failures: number }>(
      `SELECT last_facts, consecutive_failures FROM sites WHERE id = $1 FOR UPDATE`,
      [site.id],
    );
    if (!siteRows[0]) throw new PermanentJobError("site was deleted during the scan");
    const prevFacts = parseFacts(siteRows[0].last_facts);
    const historyDays = Math.max(0, ents.limits.historyDays ?? 0);
    const scanId = await saveScan(tx, report, { orgId: site.org_id, siteId: site.id, expiresAt: new Date(now.getTime() + historyDays * DAY_MS), now });
    const facts = factsOf(report);
    const nowIso = now.toISOString();

    let opened: (IssueFingerprint & { openedAt: string })[] = [];
    let resolved: { fingerprint: string; severity: string; message: string; page: string | null }[] = [];
    if (facts.reachable) {
      const fps = fingerprintReport(report);
      const current = new Map(fps.map((f) => [f.fp, f]));
      const { rows: open } = await tx.query<{ fingerprint: string; severity: string; message: string; page: string | null }>(
        `SELECT fingerprint, severity, message, page FROM site_issues WHERE site_id = $1 AND resolved_at IS NULL`,
        [site.id],
      );
      const openSet = new Set(open.map((o) => o.fingerprint));
      for (const f of fps) {
        if (openSet.has(f.fp)) continue;
        await tx.query(
          `INSERT INTO site_issues (org_id, site_id, fingerprint, rule_id, check_id, severity, message, page, opened_at, last_seen_at, first_scan_id, last_scan_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $10)`,
          [site.org_id, site.id, f.fp, f.ruleId, f.check, f.severity, f.message, f.page, nowIso, scanId],
        );
        opened.push({ ...f, openedAt: nowIso });
      }
      await tx.query(
        `UPDATE site_issues SET last_seen_at = $2, last_scan_id = $3 WHERE site_id = $1 AND resolved_at IS NULL AND fingerprint = ANY($4::text[])`,
        [site.id, nowIso, scanId, [...current.keys()]],
      );
      resolved = open.filter((o) => !current.has(o.fingerprint));
      if (resolved.length) {
        await tx.query(
          `UPDATE site_issues SET resolved_at = $2, resolved_scan_id = $3 WHERE site_id = $1 AND resolved_at IS NULL AND fingerprint = ANY($4::text[])`,
          [site.id, nowIso, scanId, resolved.map((r) => r.fingerprint)],
        );
      }
    } else {
      opened = [];
    }

    let alerts = 0;
    const events = detectChanges(prevFacts, facts, opened.filter((o) => o.severity === "critical"));
    alerts += await insertChangeAlert(tx, site, scanId, events, now);
    const resolvedCritical = resolved.filter((r) => r.severity === "critical");
    if (prevFacts && resolvedCritical.length) {
      const details = {
        siteUrl: site.url,
        events: [
          {
            kind: "resolved",
            summary: `${resolvedCritical.length} critical issue${resolvedCritical.length === 1 ? " is" : "s are"} fixed.`,
            issues: resolvedCritical.slice(0, 25).map((r) => ({ message: r.message, page: r.page, severity: r.severity, fp: r.fingerprint })),
          },
        ],
      };
      const { rows } = await tx.query(
        `INSERT INTO alerts (org_id, site_id, scan_id, kind, dedup_key, title, details, created_at)
         VALUES ($1, $2, $3, 'resolved', $4, $5, $6::jsonb, $7) ON CONFLICT (site_id, dedup_key) DO NOTHING RETURNING id`,
        [
          site.org_id,
          site.id,
          scanId,
          changeSetKey(site.id, "resolved", [...resolvedCritical.map((r) => r.fingerprint), scanId]),
          `Resolved: ${resolvedCritical.length} critical issue${resolvedCritical.length === 1 ? "" : "s"}`,
          JSON.stringify(details),
          nowIso,
        ],
      );
      alerts += rows.length;
    }

    await tx.query(
      `UPDATE sites SET last_scan_at = $2, last_scan_id = $3, last_score = $4, last_facts = $5::jsonb,
         status = $6, consecutive_failures = CASE WHEN $7 THEN 0 ELSE consecutive_failures END,
         last_error = CASE WHEN $7 THEN NULL ELSE last_error END
       WHERE id = $1`,
      [site.id, nowIso, scanId, report.score, JSON.stringify(facts), facts.reachable ? "ok" : "unreachable", facts.reachable],
    );
    return { scanId, alerts, opened: opened.length, resolved: resolved.length };
  });
}

// -------------------------------------------------------------------------------------------------
// Job handlers

export function siteScanJobHandler(d: MonitorDeps, afterScan?: (siteId: string) => Promise<void>): JobHandler {
  return async (payload, ctx) => {
    const outcome = await runSiteScanJob(d, payload, ctx);
    if (outcome.alerts && afterScan && typeof payload.siteId === "string") await afterScan(payload.siteId);
  };
}
