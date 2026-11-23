import type { Migration } from "@repo/database";

/**
 * Billing tables. Columns beyond CONTRACTS.md (all additive):
 * - billing_subscriptions.stripe_customer_id, cancel_at, payment_failed_at (grace period start)
 * - billing_events.org_id, outcome (processed | duplicate | ignored | stale | unknown_price | failed)
 * No foreign key to auth_organization so the package stays independent of @repo/auth.
 */
export const BILLING_MIGRATIONS: Migration[] = [
  {
    id: "billing_0001_init",
    sql: `
CREATE TABLE IF NOT EXISTS billing_customers (
  org_id text PRIMARY KEY,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  org_id text PRIMARY KEY,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  plan_id text NOT NULL,
  status text NOT NULL,
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancel_at timestamptz,
  payment_failed_at timestamptz,
  last_event_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_subscriptions_status_idx ON billing_subscriptions (status);

CREATE TABLE IF NOT EXISTS billing_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  org_id text,
  created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  outcome text,
  error text
);
CREATE INDEX IF NOT EXISTS billing_events_received_idx ON billing_events (received_at);
CREATE INDEX IF NOT EXISTS billing_events_unprocessed_idx ON billing_events (received_at) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS billing_usage (
  org_id text NOT NULL,
  metric text NOT NULL,
  period text NOT NULL,
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (org_id, metric, period)
);
`,
  },
  {
    // One-time passes (Checkout mode "payment"). id = the Stripe Checkout Session id, so the webhook and the
    // buyer's claim redirect record the same row at most once.
    id: "billing_0002_passes",
    sql: `
CREATE TABLE IF NOT EXISTS billing_passes (
  id text PRIMARY KEY,
  app text NOT NULL,
  pass_id text NOT NULL,
  org_id text,
  email text,
  stripe_customer_id text,
  payment_intent_id text,
  amount_cents integer,
  currency text,
  livemode boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_passes_org_idx ON billing_passes (org_id, expires_at) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_passes_payment_intent_idx ON billing_passes (payment_intent_id);
`,
  },
];
