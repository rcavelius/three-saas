/**
 * Drizzle schema for HookPilot. Mirrors HOOKPILOT_MIGRATIONS in ./migrations.ts (keep in sync).
 * Data access in lib/*.ts uses raw parameterised SQL through the executor so it behaves identically
 * on node-postgres and PGlite (bytea and bigint handling differ between the drivers' query builders).
 */
import { coreSchema } from "@repo/database";
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  bigint,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull().default("Untitled endpoint"),
    /** Owning organization (accounts); NULL for anonymous endpoints. */
    orgId: text("org_id"),
    createdBy: text("created_by"),
    /** sha256 hex of the anonymous owner token; the raw token only lives in the owner's cookie. */
    anonOwnerHash: text("anon_owner_hash"),
    plan: text("plan").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** NULL = never expires (paid plans). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Set when the org's plan no longer covers this endpoint (downgrade): capture answers 423. */
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    maxRequests: integer("max_requests").notNull().default(100),
    requestCount: bigint("request_count", { mode: "number" }).notNull().default(0),
    lastRequestAt: timestamp("last_request_at", { withTimezone: true }),
    responseStatus: integer("response_status").notNull().default(200),
    responseContentType: text("response_content_type").notNull().default("application/json"),
    responseBody: text("response_body"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("endpoints_slug_idx").on(t.slug), index("endpoints_expires_idx").on(t.expiresAt)],
);

export const capturedRequests = pgTable(
  "captured_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => endpoints.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull().default(""),
    query: text("query").notNull().default(""),
    /** Ordered list of [name, value] pairs. */
    headers: jsonb("headers").$type<[string, string][]>().notNull().default([]),
    body: bytea("body"),
    bodySize: integer("body_size").notNull().default(0),
    bodyTruncated: boolean("body_truncated").notNull().default(false),
    contentType: text("content_type"),
    sourceIp: text("source_ip"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("captured_requests_seq_idx").on(t.seq),
    index("captured_requests_endpoint_seq_idx").on(t.endpointId, t.seq),
    index("captured_requests_endpoint_time_idx").on(t.endpointId, t.receivedAt),
  ],
);

export const destinations = pgTable("hp_destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationTokenHash: text("verification_token_hash"),
  verificationAttemptedAt: timestamp("verification_attempted_at", { withTimezone: true }),
  lastVerificationError: text("last_verification_error"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const replays = pgTable("hp_replays", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  endpointId: uuid("endpoint_id"),
  requestId: uuid("request_id"),
  destinationId: uuid("destination_id"),
  destinationUrl: text("destination_url").notNull(),
  userId: text("user_id"),
  includedSensitive: jsonb("included_sensitive").$type<string[]>().notNull().default([]),
  attempt: integer("attempt").notNull().default(1),
  attemptsTotal: integer("attempts_total").notNull().default(1),
  status: text("status").notNull(),
  responseStatus: integer("response_status"),
  elapsedMs: integer("elapsed_ms"),
  errorCode: text("error_code"),
  error: text("error"),
  responseHeaders: jsonb("response_headers"),
  responseBodyPreview: text("response_body_preview"),
  responseTruncated: boolean("response_truncated").notNull().default(false),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const schema = { ...coreSchema, endpoints, capturedRequests, destinations, replays };
export type HookPilotSchema = typeof schema;
