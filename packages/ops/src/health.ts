/** Health report for the owner dashboard / authenticated probes, and the uptime self-check job. */
import type { DbHandle } from "@repo/database";
import { autoResolve, raiseIncident } from "./incidents";
import { getSetting, setSetting } from "./state";
import { silentLogger, type FetchLike, type JobHandler, type SqlExecutor } from "./types";

export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthReport {
  status: HealthStatus;
  version: string;
  checkedAt: string;
  checks: {
    db: { ok: boolean; latencyMs: number | null; error?: string };
    queue: { backlog: number; oldestQueuedAgeSeconds: number | null };
    deadLetters24h: number;
    scheduler: { lastHeartbeatAt: string | null; ageSeconds: number | null; stale: boolean };
    emailOutbox: { failed24h: number; pending: number };
    openCriticalIncidents: number;
  };
  reasons: string[];
}

export interface HealthOptions {
  now?: Date;
  version?: string;
  dbTimeoutMs?: number;
  /** Scheduler heartbeat older than this => degraded (default 5 min). */
  schedulerStaleMs?: number;
  /** Oldest due job older than this => degraded (default 15 min). */
  queueStaleMs?: number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function healthReport(handle: Pick<DbHandle<any>, "executor">, opts: HealthOptions = {}): Promise<HealthReport> {
  const ex = handle.executor;
  const now = opts.now ?? new Date();
  const version = opts.version ?? "unknown";
  const reasons: string[] = [];
  const report: HealthReport = {
    status: "ok",
    version,
    checkedAt: now.toISOString(),
    checks: {
      db: { ok: false, latencyMs: null },
      queue: { backlog: 0, oldestQueuedAgeSeconds: null },
      deadLetters24h: 0,
      scheduler: { lastHeartbeatAt: null, ageSeconds: null, stale: true },
      emailOutbox: { failed24h: 0, pending: 0 },
      openCriticalIncidents: 0,
    },
    reasons,
  };

  const t0 = performance.now();
  try {
    await withTimeout(ex.query(`SELECT 1`), opts.dbTimeoutMs ?? 2_000);
    report.checks.db = { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    report.checks.db = { ok: false, latencyMs: null, error: (err as Error).message.slice(0, 200) };
    report.status = "down";
    reasons.push("database unreachable");
    return report;
  }

  const iso = now.toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { rows } = await ex.query<{
    backlog: number;
    oldest: Date | null;
    dead: number;
    hb: Date | null;
    mail_failed: number;
    mail_pending: number;
    critical: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM jobs WHERE status = 'queued' AND run_at <= $1) AS backlog,
       (SELECT min(run_at) FROM jobs WHERE status = 'queued' AND run_at <= $1) AS oldest,
       (SELECT count(*)::int FROM jobs WHERE status = 'failed' AND finished_at >= $2) AS dead,
       (SELECT at FROM ops_heartbeats WHERE name = 'scheduler') AS hb,
       (SELECT count(*)::int FROM ops_email_outbox WHERE status = 'failed' AND created_at >= $2) AS mail_failed,
       (SELECT count(*)::int FROM ops_email_outbox WHERE status IN ('queued', 'retrying')) AS mail_pending,
       (SELECT count(*)::int FROM incidents WHERE status = 'open' AND severity = 'critical') AS critical`,
    [iso, dayAgo],
  );
  const r = rows[0]!;
  const oldestAge = r.oldest ? Math.max(0, Math.round((now.getTime() - new Date(r.oldest).getTime()) / 1000)) : null;
  const hbAge = r.hb ? Math.max(0, Math.round((now.getTime() - new Date(r.hb).getTime()) / 1000)) : null;
  const staleMs = opts.schedulerStaleMs ?? 5 * 60_000;
  report.checks.queue = { backlog: Number(r.backlog), oldestQueuedAgeSeconds: oldestAge };
  report.checks.deadLetters24h = Number(r.dead);
  report.checks.scheduler = {
    lastHeartbeatAt: r.hb ? new Date(r.hb).toISOString() : null,
    ageSeconds: hbAge,
    stale: hbAge === null || hbAge * 1000 > staleMs,
  };
  report.checks.emailOutbox = { failed24h: Number(r.mail_failed), pending: Number(r.mail_pending) };
  report.checks.openCriticalIncidents = Number(r.critical);

  if (report.checks.scheduler.stale) {
    reasons.push(hbAge === null ? "scheduler has never run" : `scheduler heartbeat is ${hbAge}s old`);
  }
  if (oldestAge !== null && oldestAge * 1000 > (opts.queueStaleMs ?? 15 * 60_000)) {
    reasons.push(`oldest queued job waiting ${oldestAge}s`);
  }
  if (report.checks.deadLetters24h > 0) reasons.push(`${report.checks.deadLetters24h} dead-lettered jobs in 24h`);
  if (report.checks.emailOutbox.failed24h > 0) reasons.push(`${report.checks.emailOutbox.failed24h} failed emails in 24h`);
  if (report.checks.openCriticalIncidents > 0) {
    reasons.push(`${report.checks.openCriticalIncidents} open critical incidents`);
  }
  if (reasons.length > 0) report.status = "degraded";
  return report;
}

/** The only health shape served to unauthenticated callers: no counts, errors or timings. */
export function publicHealth(report: Pick<HealthReport, "status" | "version">): { status: HealthStatus; version: string } {
  return { status: report.status, version: report.version };
}

/** UPTIME_URLS="https://a.example/api/health,https://b.example/" -> validated list (owner config only). */
export function uptimeUrlsFromEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      try {
        const u = new URL(s);
        return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
      } catch {
        return false;
      }
    });
}

export interface UptimeOptions {
  /** Owner-configured URLs (env/config). Job payloads are ignored, so user input can never add targets. */
  urls: string[];
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Consecutive failures before raising an incident (default 2). */
  failureThreshold?: number;
}

export async function runUptimeCheck(
  ex: SqlExecutor,
  opts: UptimeOptions & { now?: Date },
): Promise<{ url: string; ok: boolean; status: number | null; consecutiveFailures: number }[]> {
  const now = opts.now ?? new Date();
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const threshold = opts.failureThreshold ?? 2;
  const out = [];
  for (const url of opts.urls) {
    let ok = false;
    let status: number | null = null;
    try {
      const res = await doFetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": "ops-uptime-check/1" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      status = res.status;
      ok = res.status >= 200 && res.status < 400;
      await res.body?.cancel().catch(() => {});
    } catch {
      ok = false;
    }
    const key = `uptime:${url}`;
    const prev = (await getSetting<{ consecutiveFailures: number }>(ex, key))?.consecutiveFailures ?? 0;
    const consecutiveFailures = ok ? 0 : prev + 1;
    await setSetting(ex, key, { consecutiveFailures, lastStatus: status, checkedAt: now.toISOString() }, now);
    if (ok) {
      await autoResolve(ex, key, { now });
    } else if (consecutiveFailures >= threshold) {
      await raiseIncident(
        ex,
        {
          fingerprint: key,
          severity: "critical",
          source: "uptime",
          title: `Uptime check failing: ${new URL(url).host}`,
          details: { url, status, consecutiveFailures },
        },
        { now },
      );
    }
    out.push({ url, ok, status, consecutiveFailures });
  }
  return out;
}

export function uptimeCheckJob(ex: SqlExecutor, opts: UptimeOptions): JobHandler {
  return async (_payload, ctx) => {
    const results = await runUptimeCheck(ex, { ...opts, now: ctx.now });
    (ctx.logger ?? silentLogger).info("uptime check", {
      checked: results.length,
      failing: results.filter((r) => !r.ok).length,
    });
  };
}
