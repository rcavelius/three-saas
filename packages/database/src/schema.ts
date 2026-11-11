/**
 * Core infrastructure tables shared by every app. Each app runs its OWN database (independent
 * deployability). Identity/teams live in @repo/auth (Better Auth tables, prefixed auth_), billing in
 * @repo/billing (prefixed billing_), ops tables in @repo/ops. Keep in sync with CORE_MIGRATIONS.
 */
import { pgTable, text, uuid, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

/** Postgres-backed job queue (claimed with FOR UPDATE SKIP LOCKED). status 'failed' = dead letter. */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queue: text("queue").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_claim_idx").on(t.status, t.runAt)],
);

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  severity: text("severity").notNull(), // info | warning | critical
  source: text("source").notNull(),
  title: text("title").notNull(),
  details: jsonb("details").notNull().default({}),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** First-party, cookie-less product analytics (no third-party trackers, no IP addresses stored). */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    anonymousId: text("anonymous_id"),
    userId: text("user_id"),
    path: text("path"),
    props: jsonb("props").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_name_time_idx").on(t.name, t.createdAt)],
);

/** Fixed-window rate limit counters (shared DB => limits hold across all app instances). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

/** Infrastructure/API cost entries (recorded from provider usage or owner input, never invented). */
export const costEntries = pgTable("cost_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  source: text("source").notNull(), // "api" | "manual"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
