/**
 * Test-only setup: an in-memory PGlite database with CORE + minimal stand-ins for the @repo/auth and
 * @repo/billing tables named in docs/CONTRACTS.md + OPS migrations.
 */
import { createDb, CORE_MIGRATIONS, type DbHandle } from "@repo/database";
import { OPS_MIGRATIONS } from "../migrations";
import type { Brand } from "../types";

export const AUTH_BILLING_FIXTURE_SQL = `
CREATE TABLE auth_user (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text, email_verified boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'customer', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_organization (id text PRIMARY KEY, name text NOT NULL, slug text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_member (id text PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL, role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE billing_subscriptions (org_id text PRIMARY KEY, stripe_subscription_id text UNIQUE, plan_id text NOT NULL,
  status text NOT NULL, stripe_price_id text, current_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
  last_event_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE billing_events (id text PRIMARY KEY, type text NOT NULL, created_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz, attempts integer NOT NULL DEFAULT 0, error text);
`;

export async function makeDb(opts: { withAuthBilling?: boolean } = {}): Promise<DbHandle<any>> {
  const handle = createDb("pglite:memory", {});
  await handle.migrate(CORE_MIGRATIONS);
  if (opts.withAuthBilling !== false) {
    await handle.migrate([{ id: "test_auth_billing_fixture", sql: AUTH_BILLING_FIXTURE_SQL }]);
  }
  await handle.migrate(OPS_MIGRATIONS);
  return handle;
}

/** Mutable injected clock. */
export function makeClock(start: string | Date) {
  let t = new Date(start).getTime();
  const clock = () => new Date(t);
  return Object.assign(clock, {
    set(d: string | Date) {
      t = new Date(d).getTime();
    },
    advance(ms: number) {
      t += ms;
    },
  });
}

export const brand: Brand = {
  name: "TestBrand",
  url: "https://testbrand.example",
  primaryColor: "#0f766e",
  supportEmail: "help@testbrand.example",
};

export function logSink() {
  const lines: string[] = [];
  const mk = (base: Record<string, unknown> = {}): import("@repo/monitoring").Logger => {
    const w = (level: string) => (msg: string, f?: Record<string, unknown>) => {
      lines.push(JSON.stringify({ level, msg, ...base, ...f }));
    };
    return { debug: w("debug"), info: w("info"), warn: w("warn"), error: w("error"), child: (f) => mk({ ...base, ...f }) };
  };
  return { lines, logger: mk() };
}
