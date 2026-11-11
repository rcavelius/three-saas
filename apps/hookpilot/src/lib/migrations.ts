import type { Migration } from "@repo/database";

/** HookPilot tables. Appended after CORE_MIGRATIONS; forward-only, never edit an applied migration. */
export const HOOKPILOT_MIGRATIONS: Migration[] = [
  {
    id: "hookpilot_0001_endpoints",
    sql: `
CREATE TABLE IF NOT EXISTS endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL DEFAULT 'Untitled endpoint',
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
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
];
