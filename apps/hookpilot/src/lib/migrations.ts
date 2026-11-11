import type { Migration } from "@repo/database";

/**
 * HookPilot tables. Composed after CORE, AUTH, BILLING and OPS migrations (see lib/platform.ts);
 * forward-only, never edit an applied migration.
 */
export const HOOKPILOT_MIGRATIONS: Migration[] = [
  {
    id: "hookpilot_0001_endpoints",
    sql: `
CREATE TABLE IF NOT EXISTS endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL DEFAULT 'Untitled endpoint',
  owner_user_id uuid,
  anon_owner_hash text,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  max_requests integer NOT NULL DEFAULT 100,
  request_count bigint NOT NULL DEFAULT 0,
  last_request_at timestamptz,
  response_status integer NOT NULL DEFAULT 200,
  response_content_type text NOT NULL DEFAULT 'application/json',
  response_body text,
  deleted_at timestamptz,
  CONSTRAINT endpoints_owner_chk CHECK (owner_user_id IS NOT NULL OR anon_owner_hash IS NOT NULL),
  CONSTRAINT endpoints_status_chk CHECK (response_status BETWEEN 200 AND 599),
  CONSTRAINT endpoints_ctype_chk CHECK (response_content_type IN ('application/json', 'text/plain')),
  CONSTRAINT endpoints_body_chk CHECK (response_body IS NULL OR octet_length(response_body) <= 4096),
  CONSTRAINT endpoints_name_chk CHECK (char_length(name) <= 80)
);
CREATE UNIQUE INDEX IF NOT EXISTS endpoints_slug_idx ON endpoints (slug);
CREATE INDEX IF NOT EXISTS endpoints_anon_owner_idx ON endpoints (anon_owner_hash) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS endpoints_user_idx ON endpoints (owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS endpoints_expires_idx ON endpoints (expires_at);

CREATE TABLE IF NOT EXISTS captured_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  endpoint_id uuid NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  method text NOT NULL,
  path text NOT NULL DEFAULT '',
  query text NOT NULL DEFAULT '',
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  body bytea,
  body_size integer NOT NULL DEFAULT 0,
  body_truncated boolean NOT NULL DEFAULT false,
  content_type text,
  source_ip text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS captured_requests_seq_idx ON captured_requests (seq);
CREATE INDEX IF NOT EXISTS captured_requests_endpoint_seq_idx ON captured_requests (endpoint_id, seq DESC);
CREATE INDEX IF NOT EXISTS captured_requests_endpoint_time_idx ON captured_requests (endpoint_id, received_at DESC);
`,
  },
  {
    // Accounts: endpoints belong to an organization (or, anonymously, to an owner-token hash).
    // owner_user_id was never populated (accounts did not exist), so it is replaced by org_id.
    // expires_at becomes nullable: NULL = never expires (paid plans).
    id: "hookpilot_0002_org_endpoints",
    sql: `
ALTER TABLE endpoints DROP CONSTRAINT IF EXISTS endpoints_owner_chk;
DROP INDEX IF EXISTS endpoints_user_idx;
ALTER TABLE endpoints DROP COLUMN IF EXISTS owner_user_id;
ALTER TABLE endpoints ADD COLUMN org_id text REFERENCES auth_organization (id) ON DELETE CASCADE;
ALTER TABLE endpoints ADD COLUMN created_by text;
ALTER TABLE endpoints ADD COLUMN locked_at timestamptz;
ALTER TABLE endpoints ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE endpoints ADD CONSTRAINT endpoints_owner_chk CHECK (org_id IS NOT NULL OR anon_owner_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS endpoints_org_idx ON endpoints (org_id, created_at) WHERE deleted_at IS NULL;

CREATE TABLE hp_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES auth_organization (id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  verified_at timestamptz,
  verification_token_hash text,
  verification_attempted_at timestamptz,
  last_verification_error text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hp_destinations_name_chk CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT hp_destinations_url_chk CHECK (char_length(url) BETWEEN 8 AND 2048)
);
CREATE UNIQUE INDEX hp_destinations_org_url_idx ON hp_destinations (org_id, url);

CREATE TABLE hp_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES auth_organization (id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  endpoint_id uuid REFERENCES endpoints (id) ON DELETE SET NULL,
  request_id uuid REFERENCES captured_requests (id) ON DELETE SET NULL,
  destination_id uuid REFERENCES hp_destinations (id) ON DELETE SET NULL,
  destination_url text NOT NULL,
  user_id text,
  included_sensitive jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempt integer NOT NULL DEFAULT 1,
  attempts_total integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  response_status integer,
  elapsed_ms integer,
  error_code text,
  error text,
  response_headers jsonb,
  response_body_preview text,
  response_truncated boolean NOT NULL DEFAULT false,
  run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT hp_replays_status_chk CHECK (status IN ('scheduled', 'running', 'delivered', 'failed', 'blocked', 'skipped')),
  CONSTRAINT hp_replays_attempt_chk CHECK (attempt BETWEEN 1 AND 5 AND attempts_total BETWEEN 1 AND 5)
);
CREATE INDEX hp_replays_org_request_idx ON hp_replays (org_id, request_id, created_at DESC);
CREATE INDEX hp_replays_batch_idx ON hp_replays (batch_id, attempt);

-- "Usage near limit" emails: at most one per org, metric and period.
CREATE TABLE hp_usage_alerts (
  org_id text NOT NULL,
  metric text NOT NULL,
  period text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, metric, period)
);
`,
  },
];
