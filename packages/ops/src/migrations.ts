import type { Migration } from "@repo/database";

/**
 * Ops tables. Runs after CORE/AUTH/BILLING migrations (it alters CORE's `incidents` table and adds
 * indexes on CORE's `jobs`, `cost_entries` and `analytics_events`).
 */
export const OPS_MIGRATIONS: Migration[] = [
  {
    id: "ops_0001_schedules_heartbeats_outbox",
    sql: `
CREATE TABLE IF NOT EXISTS ops_schedules (
  name text PRIMARY KEY,
  interval_seconds integer NOT NULL CHECK (interval_seconds > 0),
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  last_status text,
  last_error text
);

CREATE TABLE IF NOT EXISTS ops_heartbeats (
  name text PRIMARY KEY,
  at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ops_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  html_body text NOT NULL,
  tag text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued | retrying | sent | logged | failed
  attempts integer NOT NULL DEFAULT 0,
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS ops_email_outbox_status_idx ON ops_email_outbox (status, created_at);

CREATE INDEX IF NOT EXISTS jobs_dead_letter_idx ON jobs (queue, finished_at) WHERE status = 'failed';
`,
  },
  {
    id: "ops_0002_incident_dedup",
    sql: `
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS occurrences integer NOT NULL DEFAULT 1;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS notified_at timestamptz;
UPDATE incidents SET last_seen_at = created_at WHERE last_seen_at IS NULL;
ALTER TABLE incidents ALTER COLUMN last_seen_at SET DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS incidents_open_fingerprint_uq ON incidents (fingerprint) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS incidents_fingerprint_idx ON incidents (fingerprint, notified_at);
CREATE INDEX IF NOT EXISTS incidents_status_severity_idx ON incidents (status, severity);
`,
  },
  {
    id: "ops_0003_budgets_settings",
    sql: `
CREATE TABLE IF NOT EXISTS ops_budgets (
  name text PRIMARY KEY, -- a cost_entries.provider value, or 'total'
  monthly_limit_cents integer NOT NULL CHECK (monthly_limit_cents > 0),
  warn_ratio double precision NOT NULL DEFAULT 0.8 CHECK (warn_ratio > 0 AND warn_ratio <= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_entries_period_idx ON cost_entries (period_start);
`,
  },
  {
    // Acknowledged incidents stay 'open' (dedup and auto-resolve keep working) but stop paging the owner.
    id: "ops_0004_incident_ack",
    sql: `
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_by text;
`,
  },
  {
    // Where visitors come from (privacy-safe: referrer host only, UTM tokens, CF country code, coarse
    // device class, obvious-bot flag). Never an IP, full URL or user-agent string.
    id: "ops_0005_analytics_sources",
    sql: `
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS referrer_host text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS device text;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS is_landing boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS analytics_time_idx ON analytics_events (created_at);
`,
  },
];
