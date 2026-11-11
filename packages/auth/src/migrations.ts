/**
 * Hand-written SQL for the Better Auth tables. Generated-equivalent to Better Auth's own
 * `getMigrations(...).compileMigrations()` for the options in buildAuthOptions (same tables, columns,
 * types, nullability, foreign keys with ON DELETE CASCADE and indexes), plus a few stricter extras:
 * SQL defaults that mirror Better Auth's defaultValues, NOT NULL on auth_user.role, and a unique
 * (organization_id, user_id) on auth_member. `schema-parity.test.ts` re-checks this against
 * Better Auth's expected schema, so a Better Auth upgrade that needs new columns fails the tests.
 */
import type { Migration } from "@repo/database";

export const AUTH_MIGRATIONS: Migration[] = [
  {
    id: "auth_0001_better_auth_core",
    sql: `
CREATE TABLE auth_user (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  role text NOT NULL DEFAULT 'customer'
);

CREATE TABLE auth_session (
  id text NOT NULL PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
  active_organization_id text
);
CREATE INDEX auth_session_user_id_idx ON auth_session (user_id);

CREATE TABLE auth_account (
  id text NOT NULL PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL
);
CREATE INDEX auth_account_user_id_idx ON auth_account (user_id);

CREATE TABLE auth_verification (
  id text NOT NULL PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX auth_verification_identifier_idx ON auth_verification (identifier);

CREATE TABLE auth_rate_limit (
  id text NOT NULL PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);
`,
  },
  {
    id: "auth_0002_organizations",
    sql: `
CREATE TABLE auth_organization (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata text
);

CREATE TABLE auth_member (
  id text NOT NULL PRIMARY KEY,
  organization_id text NOT NULL REFERENCES auth_organization (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX auth_member_organization_id_idx ON auth_member (organization_id);
CREATE INDEX auth_member_user_id_idx ON auth_member (user_id);
CREATE UNIQUE INDEX auth_member_org_user_uidx ON auth_member (organization_id, user_id);

CREATE TABLE auth_invitation (
  id text NOT NULL PRIMARY KEY,
  organization_id text NOT NULL REFERENCES auth_organization (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  inviter_id text NOT NULL REFERENCES auth_user (id) ON DELETE CASCADE
);
CREATE INDEX auth_invitation_organization_id_idx ON auth_invitation (organization_id);
CREATE INDEX auth_invitation_email_idx ON auth_invitation (email);
`,
  },
];
