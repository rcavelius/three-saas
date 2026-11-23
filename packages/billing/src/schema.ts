/** Drizzle mirror of BILLING_MIGRATIONS (keep in sync). Queries in this package use raw SQL. */
import { pgTable, text, timestamp, boolean, integer, bigint, index, primaryKey } from "drizzle-orm/pg-core";

export const billingCustomers = pgTable("billing_customers", {
  orgId: text("org_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    orgId: text("org_id").primaryKey(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    planId: text("plan_id").notNull(),
    status: text("status").notNull(),
    stripePriceId: text("stripe_price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("billing_subscriptions_status_idx").on(t.status)],
);

export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    orgId: text("org_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    outcome: text("outcome"),
    error: text("error"),
  },
  (t) => [index("billing_events_received_idx").on(t.receivedAt)],
);

export const billingUsage = pgTable(
  "billing_usage",
  {
    orgId: text("org_id").notNull(),
    metric: text("metric").notNull(),
    period: text("period").notNull(),
    used: bigint("used", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.metric, t.period] })],
);

export const billingPasses = pgTable(
  "billing_passes",
  {
    id: text("id").primaryKey(),
    app: text("app").notNull(),
    passId: text("pass_id").notNull(),
    orgId: text("org_id"),
    email: text("email"),
    stripeCustomerId: text("stripe_customer_id"),
    paymentIntentId: text("payment_intent_id"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    livemode: boolean("livemode").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("billing_passes_org_idx").on(t.orgId, t.expiresAt), index("billing_passes_payment_intent_idx").on(t.paymentIntentId)],
);

export const billingSchema = { billingCustomers, billingSubscriptions, billingEvents, billingUsage, billingPasses };
