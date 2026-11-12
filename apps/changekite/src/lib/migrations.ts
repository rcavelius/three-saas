import type { Migration } from "@repo/database";

/** ChangeKite tables. Appended after CORE/AUTH/BILLING/OPS migrations; ids are permanent. */
export const CHANGEKITE_MIGRATIONS: Migration[] = [
  {
    id: "changekite_0001_scans",
    sql: `
CREATE TABLE IF NOT EXISTS scans (
  id text PRIMARY KEY,
  url text NOT NULL,
  host text NOT NULL,
  score integer NOT NULL,
  critical integer NOT NULL,
  warning integer NOT NULL,
  notice integer NOT NULL,
  pages integer NOT NULL,
  duration_ms integer NOT NULL,
  report jsonb NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS scans_host_created_idx ON scans (host, created_at);
CREATE INDEX IF NOT EXISTS scans_expires_idx ON scans (expires_at);
`,
  },
  {
    id: "changekite_0002_monitoring",
    sql: `
-- Account scans belong to an org (and usually a monitored site); anonymous scans keep org_id NULL.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS home_status integer;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS reachable boolean;
ALTER TABLE scans ADD COLUMN IF NOT EXISTS fingerprints jsonb;
CREATE INDEX IF NOT EXISTS scans_site_created_idx ON scans (site_id, created_at DESC) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scans_org_idx ON scans (org_id) WHERE org_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  url text NOT NULL,
  host text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paused boolean NOT NULL DEFAULT false,
  plan_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_scan_at timestamptz,
  next_scan_at timestamptz,
  last_scan_id text,
  last_score integer,
  last_facts jsonb,
  last_error text,
  alerts_muted boolean NOT NULL DEFAULT false,
  alert_recipients text[] NOT NULL DEFAULT '{}',
  CONSTRAINT sites_org_url_unique UNIQUE (org_id, url)
);
CREATE INDEX IF NOT EXISTS sites_org_idx ON sites (org_id, created_at);
CREATE INDEX IF NOT EXISTS sites_due_idx ON sites (next_scan_at) WHERE paused = false AND plan_locked = false;

-- One row per issue "episode": opened when a fingerprint first appears, resolved when it disappears.
CREATE TABLE IF NOT EXISTS site_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  site_id uuid NOT NULL,
  fingerprint text NOT NULL,
  rule_id text NOT NULL,
  check_id text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  page text,
  opened_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  first_scan_id text,
  last_scan_id text,
  resolved_at timestamptz,
  resolved_scan_id text
);
CREATE UNIQUE INDEX IF NOT EXISTS site_issues_open_idx ON site_issues (site_id, fingerprint) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS site_issues_site_idx ON site_issues (site_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  site_id uuid NOT NULL,
  scan_id text,
  kind text NOT NULL,
  dedup_key text NOT NULL,
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  recipients text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz,
  CONSTRAINT alerts_dedup_unique UNIQUE (site_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS alerts_org_idx ON alerts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_pending_idx ON alerts (status) WHERE status = 'pending';

-- Global concurrency cap for monitoring scans across every instance (one row per busy slot).
CREATE TABLE IF NOT EXISTS scan_leases (
  slot integer PRIMARY KEY,
  holder text NOT NULL,
  expires_at timestamptz NOT NULL
);
`,
  },
];
