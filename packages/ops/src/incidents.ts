/**
 * Incidents with de-duplication: one open incident per fingerprint (partial unique index). Repeats bump
 * `occurrences` and `last_seen_at`; severity can be raised by a repeat but never lowered.
 */
import { redact } from "@repo/monitoring";
import type { Severity, SqlExecutor } from "./types";

export interface IncidentInput {
  fingerprint: string;
  severity: Severity;
  source: string;
  title: string;
  details?: Record<string, unknown>;
}

export interface RaiseResult {
  id: string;
  created: boolean;
  severity: Severity;
  occurrences: number;
}

export interface IncidentRow {
  id: string;
  fingerprint: string | null;
  severity: Severity;
  source: string;
  title: string;
  details: Record<string, unknown>;
  status: string;
  occurrences: number;
  created_at: Date;
  last_seen_at: Date;
  notified_at: Date | null;
  resolved_at: Date | null;
}

export const SEVERITIES: Severity[] = ["info", "warning", "critical"];

const rank = (col: string) => `(CASE ${col} WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END)`;

export async function raiseIncident(
  ex: SqlExecutor,
  i: IncidentInput,
  opts: { now?: Date } = {},
): Promise<RaiseResult> {
  if (!SEVERITIES.includes(i.severity)) throw new Error(`Invalid severity: ${String(i.severity)}`);
  if (!i.fingerprint || i.fingerprint.length > 200) throw new Error("Incident fingerprint must be 1-200 chars");
  const now = (opts.now ?? new Date()).toISOString();
  const details = JSON.stringify(redact(i.details ?? {}));
  const { rows } = await ex.query<{ id: string; severity: Severity; occurrences: number; created: boolean }>(
    `INSERT INTO incidents (severity, source, title, details, status, fingerprint, occurrences, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4::jsonb, 'open', $5, 1, $6, $6)
     ON CONFLICT (fingerprint) WHERE status = 'open' DO UPDATE SET
       occurrences = incidents.occurrences + 1,
       last_seen_at = EXCLUDED.last_seen_at,
       title = EXCLUDED.title,
       details = EXCLUDED.details,
       severity = CASE WHEN ${rank("EXCLUDED.severity")} > ${rank("incidents.severity")}
                       THEN EXCLUDED.severity ELSE incidents.severity END
     RETURNING id, severity, occurrences::int AS occurrences, (xmax = 0) AS created`,
    [i.severity, i.source.slice(0, 100), i.title.slice(0, 300), details, i.fingerprint, now],
  );
  const r = rows[0]!;
  return { id: r.id, severity: r.severity, occurrences: Number(r.occurrences), created: Boolean(r.created) };
}

export async function resolveIncident(ex: SqlExecutor, id: string, opts: { now?: Date } = {}): Promise<boolean> {
  const { rows } = await ex.query<{ id: string }>(
    `UPDATE incidents SET status = 'resolved', resolved_at = $2 WHERE id = $1 AND status <> 'resolved' RETURNING id`,
    [id, (opts.now ?? new Date()).toISOString()],
  );
  return rows.length > 0;
}

/** Resolves the open incident for a fingerprint, if any (used by checks that recover). */
export async function autoResolve(ex: SqlExecutor, fingerprint: string, opts: { now?: Date } = {}): Promise<boolean> {
  const { rows } = await ex.query<{ id: string }>(
    `UPDATE incidents SET status = 'resolved', resolved_at = $2,
       details = details || '{"resolution":"auto"}'::jsonb
     WHERE fingerprint = $1 AND status = 'open' RETURNING id`,
    [fingerprint, (opts.now ?? new Date()).toISOString()],
  );
  return rows.length > 0;
}

export async function listOpenIncidents(ex: SqlExecutor, opts: { severity?: Severity } = {}): Promise<IncidentRow[]> {
  const { rows } = await ex.query<IncidentRow>(
    `SELECT id, fingerprint, severity, source, title, details, status, occurrences::int AS occurrences,
            created_at, last_seen_at, notified_at, resolved_at
     FROM incidents WHERE status = 'open' AND ($1::text IS NULL OR severity = $1)
     ORDER BY ${rank("severity")} DESC, last_seen_at DESC`,
    [opts.severity ?? null],
  );
  return rows;
}

export async function getOpenIncident(ex: SqlExecutor, fingerprint: string): Promise<IncidentRow | null> {
  const { rows } = await ex.query<IncidentRow>(
    `SELECT id, fingerprint, severity, source, title, details, status, occurrences::int AS occurrences,
            created_at, last_seen_at, notified_at, resolved_at
     FROM incidents WHERE status = 'open' AND fingerprint = $1`,
    [fingerprint],
  );
  return rows[0] ?? null;
}
