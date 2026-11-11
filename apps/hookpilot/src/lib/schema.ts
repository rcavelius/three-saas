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
    ownerUserId: uuid("owner_user_id").references(() => coreSchema.users.id, { onDelete: "cascade" }),
    /** sha256 hex of the anonymous owner token; the raw token only lives in the owner's cookie. */
    anonOwnerHash: text("anon_owner_hash"),
    plan: text("plan").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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

export const schema = { ...coreSchema, endpoints, capturedRequests };
export type HookPilotSchema = typeof schema;
