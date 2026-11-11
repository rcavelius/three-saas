/**
 * Real-PostgreSQL helpers. TEST_DATABASE_URL points at a server where the user may CREATE DATABASE
 * (CI: the postgres service container). Each test file gets a fresh database, dropped afterwards.
 */
import pg from "pg";
import { randomBytes } from "node:crypto";
import { createDb, type DbHandle } from "@repo/database";

export const PG_URL = process.env.TEST_DATABASE_URL;
export const hasPg = Boolean(PG_URL);

export async function freshDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  if (!PG_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `it_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(PG_URL);
  u.pathname = `/${name}`;
  return {
    url: u.toString(),
    drop: async () => {
      const c = new pg.Client({ connectionString: PG_URL });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    },
  };
}

/** Several independent pools on the same database = several app instances. */
export function instances(url: string, n: number): DbHandle<Record<string, unknown>>[] {
  return Array.from({ length: n }, () => createDb(url, {}));
}
