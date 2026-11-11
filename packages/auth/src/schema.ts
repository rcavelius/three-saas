/**
 * Drizzle schema for the Better Auth tables (core + organization plugin + database rate limiting).
 *
 * Better Auth's drizzle adapter addresses tables by the export key (= Better Auth `modelName`) and
 * columns by property name (= the mapped Better Auth field name). We map every field to its
 * snake_case column name in Better Auth's config (`fields`), so property names here are snake_case
 * and identical to the SQL column names. Keep in sync with AUTH_MIGRATIONS (a test diffs both
 * against Better Auth's own expected schema).
 */
import { pgTable, text, boolean, timestamp, bigint, integer, index, uniqueIndex } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

export const auth_user = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  email_verified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  created_at: timestamp("created_at", tz).notNull().defaultNow(),
  updated_at: timestamp("updated_at", tz).notNull().defaultNow(),
  /** Platform role: customer (default) | operator | owner. Never settable from client input. */
  role: text("role").notNull().default("customer"),
});

export const auth_session = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expires_at: timestamp("expires_at", tz).notNull(),
    token: text("token").notNull().unique(),
    created_at: timestamp("created_at", tz).notNull().defaultNow(),
    updated_at: timestamp("updated_at", tz).notNull(),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    user_id: text("user_id")
      .notNull()
      .references(() => auth_user.id, { onDelete: "cascade" }),
    active_organization_id: text("active_organization_id"),
  },
  (t) => [index("auth_session_user_id_idx").on(t.user_id)],
);

export const auth_account = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    account_id: text("account_id").notNull(),
    provider_id: text("provider_id").notNull(),
    user_id: text("user_id")
      .notNull()
      .references(() => auth_user.id, { onDelete: "cascade" }),
    access_token: text("access_token"),
    refresh_token: text("refresh_token"),
    id_token: text("id_token"),
    access_token_expires_at: timestamp("access_token_expires_at", tz),
    refresh_token_expires_at: timestamp("refresh_token_expires_at", tz),
    scope: text("scope"),
    password: text("password"),
    created_at: timestamp("created_at", tz).notNull().defaultNow(),
    updated_at: timestamp("updated_at", tz).notNull(),
  },
  (t) => [index("auth_account_user_id_idx").on(t.user_id)],
);

export const auth_verification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expires_at: timestamp("expires_at", tz).notNull(),
    created_at: timestamp("created_at", tz).notNull().defaultNow(),
    updated_at: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);

export const auth_organization = pgTable("auth_organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  created_at: timestamp("created_at", tz).notNull().defaultNow(),
  /** JSON string (Better Auth). Personal orgs carry {"personal":true}. */
  metadata: text("metadata"),
});

export const auth_member = pgTable(
  "auth_member",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => auth_organization.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => auth_user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    created_at: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("auth_member_organization_id_idx").on(t.organization_id),
    index("auth_member_user_id_idx").on(t.user_id),
    uniqueIndex("auth_member_org_user_uidx").on(t.organization_id, t.user_id),
  ],
);

export const auth_invitation = pgTable(
  "auth_invitation",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => auth_organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expires_at: timestamp("expires_at", tz).notNull(),
    created_at: timestamp("created_at", tz).notNull().defaultNow(),
    inviter_id: text("inviter_id")
      .notNull()
      .references(() => auth_user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("auth_invitation_organization_id_idx").on(t.organization_id),
    index("auth_invitation_email_idx").on(t.email),
  ],
);

export const auth_rate_limit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  last_request: bigint("last_request", { mode: "number" }).notNull(),
});

/** Every Better Auth table, keyed by Better Auth modelName (what the drizzle adapter expects). */
export const authSchema = {
  auth_user,
  auth_session,
  auth_account,
  auth_verification,
  auth_organization,
  auth_member,
  auth_invitation,
  auth_rate_limit,
};
