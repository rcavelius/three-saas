/**
 * Tiny forward-only SQL migration runner that works on node-postgres and PGlite.
 * Apps append their own migrations after CORE_MIGRATIONS; ids must be unique and stable.
 */
export interface Migration {
  id: string;
  sql: string;
}

export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const CORE_MIGRATIONS: Migration[] = [
  {
    id: "core_0001_init",
    // Identity tables were removed from this migration before any deployment existed;
    // they now live in @repo/auth (AUTH_MIGRATIONS) and @repo/billing (BILLING_MIGRATIONS).
    sql: `
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (status, run_at);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL,
  source text NOT NULL,
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  anonymous_id text,
  user_id text,
  path text,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_name_time_idx ON analytics_events (name, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
];

export async function runMigrations(executor: SqlExecutor, migrations: Migration[]): Promise<string[]> {
  const ids = new Set<string>();
  for (const m of migrations) {
    if (ids.has(m.id)) throw new Error(`Duplicate migration id: ${m.id}`);
    ids.add(m.id);
  }
  await executor.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`,
  );
  const { rows } = await executor.query<{ id: string }>(`SELECT id FROM _migrations`);
  const done = new Set(rows.map((r) => r.id));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await executor.exec(`BEGIN;`);
    try {
      await executor.exec(m.sql);
      await executor.query(`INSERT INTO _migrations (id) VALUES ($1)`, [m.id]);
      await executor.exec(`COMMIT;`);
    } catch (err) {
      await executor.exec(`ROLLBACK;`);
      throw new Error(`Migration ${m.id} failed: ${(err as Error).message}`);
    }
    applied.push(m.id);
  }
  return applied;
}
