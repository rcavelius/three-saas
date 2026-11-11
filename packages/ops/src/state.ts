/** Heartbeats (liveness of background loops) and a tiny key/value settings store. */
import type { SqlExecutor } from "./types";

export async function writeHeartbeat(
  ex: SqlExecutor,
  name: string,
  details: Record<string, unknown> = {},
  now: Date = new Date(),
): Promise<void> {
  await ex.query(
    `INSERT INTO ops_heartbeats (name, at, details) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (name) DO UPDATE SET at = EXCLUDED.at, details = EXCLUDED.details`,
    [name, now.toISOString(), JSON.stringify(details)],
  );
}

export async function getHeartbeat(
  ex: SqlExecutor,
  name: string,
): Promise<{ at: Date; details: Record<string, unknown> } | null> {
  const { rows } = await ex.query<{ at: Date | string; details: Record<string, unknown> }>(
    `SELECT at, details FROM ops_heartbeats WHERE name = $1`,
    [name],
  );
  const r = rows[0];
  return r ? { at: new Date(r.at), details: r.details } : null;
}

export async function getSetting<T = unknown>(ex: SqlExecutor, key: string): Promise<T | null> {
  const { rows } = await ex.query<{ value: T }>(`SELECT value FROM ops_settings WHERE key = $1`, [key]);
  return rows[0] ? rows[0].value : null;
}

export async function setSetting(ex: SqlExecutor, key: string, value: unknown, now: Date = new Date()): Promise<void> {
  await ex.query(
    `INSERT INTO ops_settings (key, value, updated_at) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, JSON.stringify(value), now.toISOString()],
  );
}
