/**
 * Test-only setup: an in-memory PGlite database with the REAL core, @repo/auth, @repo/billing and ops
 * migrations, so metrics and billing-health queries are tested against the actual schema.
 */
import { createDb, CORE_MIGRATIONS, type DbHandle } from "@repo/database";
import { AUTH_MIGRATIONS } from "@repo/auth";
import { BILLING_MIGRATIONS } from "@repo/billing";
import { OPS_MIGRATIONS } from "../migrations";
import type { Brand } from "../types";


export async function makeDb(opts: { withAuthBilling?: boolean } = {}): Promise<DbHandle<any>> {
  const handle = createDb("pglite:memory", {});
  await handle.migrate(CORE_MIGRATIONS);
  if (opts.withAuthBilling !== false) {
    await handle.migrate([...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS]);
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
