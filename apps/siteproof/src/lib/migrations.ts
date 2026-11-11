import type { Migration } from "@repo/database";

/** SiteProof tables. Appended after CORE_MIGRATIONS; ids are permanent. */
export const SITEPROOF_MIGRATIONS: Migration[] = [
  {
    id: "siteproof_0001_scans",
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
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS scans_host_created_idx ON scans (host, created_at);
CREATE INDEX IF NOT EXISTS scans_expires_idx ON scans (expires_at);
`,
  },
];
