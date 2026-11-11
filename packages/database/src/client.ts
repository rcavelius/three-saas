/**
 * Database client factory.
 *
 *   DATABASE_URL=postgres://...      -> node-postgres Pool (production: Neon, Supabase, RDS, Fly Postgres)
 *   DATABASE_URL=pglite:memory       -> in-process PGlite, in memory (tests)
 *   DATABASE_URL=pglite:./.data/db   -> in-process PGlite persisted to a folder (local dev, no Docker needed)
 *
 * PGlite is real Postgres compiled to WASM, so SQL behaves the same as production.
 */
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { runMigrations, type Migration, type SqlExecutor } from "./migrations";

export type AnyDb = ReturnType<typeof drizzlePg> | ReturnType<typeof drizzlePglite>;

export interface DbHandle<TSchema extends Record<string, unknown> = Record<string, unknown>> {
  /** Drizzle instance. Typed as node-postgres flavour; both drivers share the query-builder API. */
  db: ReturnType<typeof drizzlePg<TSchema>>;
  executor: SqlExecutor;
  driver: "pg" | "pglite";
  migrate(migrations: Migration[]): Promise<string[]>;
  /**
   * Runs fn inside one BEGIN/COMMIT on a single connection; rolls back on throw.
   * Use for check-then-write sequences (usage accounting, plan-limit counts with advisory locks).
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createDb<TSchema extends Record<string, unknown>>(
  url: string,
  schema: TSchema,
): DbHandle<TSchema> {
  if (url.startsWith("pglite:")) {
    const target = url.slice("pglite:".length);
    const client = target === "memory" || target === "" ? new PGlite() : new PGlite(target);
    const db = drizzlePglite(client, { schema });
    const executor: SqlExecutor = {
      exec: (sql) => client.exec(sql),
      query: async <T>(sql: string, params?: unknown[]) => {
        const r = await client.query<T>(sql, params as unknown[]);
        return { rows: r.rows };
      },
    };
    return {
      db: db as unknown as DbHandle<TSchema>["db"],
      executor,
      driver: "pglite",
      migrate: (m) => runMigrations(executor, m),
      transaction: (fn) =>
        client.transaction(async (t) =>
          fn({
            exec: (sql) => t.exec(sql),
            query: async <T>(sql: string, params?: unknown[]) => {
              const r = await t.query<T>(sql, params as unknown[]);
              return { rows: r.rows };
            },
          }),
        ),
      close: () => client.close(),
    };
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new Error("DATABASE_URL must be a postgres:// URL or pglite:<path|memory>");
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
  });
  const db = drizzlePg(pool, { schema });
  const executor: SqlExecutor = {
    // Migrations run BEGIN/COMMIT as separate statements, so they must share one connection.
    exec: async (sql) => pool.query(sql),
    query: async <T>(sql: string, params?: unknown[]) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
  };
  return {
    db,
    executor,
    driver: "pg",
    migrate: async (m) => {
      const conn = await pool.connect();
      try {
        const single: SqlExecutor = {
          exec: (sql) => conn.query(sql),
          query: async <T>(sql: string, params?: unknown[]) => {
            const r = await conn.query(sql, params);
            return { rows: r.rows as T[] };
          },
        };
        // Several instances may boot at once: serialise migrations with a session-level advisory lock.
        await conn.query("SELECT pg_advisory_lock(7274827)");
        try {
          return await runMigrations(single, m);
        } finally {
          await conn.query("SELECT pg_advisory_unlock(7274827)").catch(() => undefined);
        }
      } finally {
        conn.release();
      }
    },
    transaction: async (fn) => {
      const conn = await pool.connect();
      try {
        await conn.query("BEGIN");
        const result = await fn({
          exec: (sql) => conn.query(sql),
          query: async <T>(sql: string, params?: unknown[]) => {
            const r = await conn.query(sql, params);
            return { rows: r.rows as T[] };
          },
        });
        await conn.query("COMMIT");
        return result;
      } catch (err) {
        await conn.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
    },
    close: () => pool.end(),
  };
}
