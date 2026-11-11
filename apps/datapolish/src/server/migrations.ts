import { AUTH_MIGRATIONS } from "@repo/auth";
import { BILLING_MIGRATIONS } from "@repo/billing";
import { CORE_MIGRATIONS, type Migration } from "@repo/database";
import { OPS_MIGRATIONS } from "@repo/ops";
import { SUPPORT_MIGRATIONS } from "@repo/support";

/**
 * DataPolish's own tables. The database holds accounts, billing, ops and saved workflows ONLY.
 * File contents and cleaned data never reach the server, so there is no table for them.
 */
export const APP_MIGRATIONS: Migration[] = [
  {
    id: "datapolish_0001_workflows",
    sql: `
CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  pipeline jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflows_org_created_idx ON workflows (org_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS workflows_org_name_uq ON workflows (org_id, lower(name));
`,
  },
];

export const ALL_MIGRATIONS: Migration[] = [...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS, ...SUPPORT_MIGRATIONS, ...APP_MIGRATIONS];
