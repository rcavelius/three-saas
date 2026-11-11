/**
 * Proves AUTH_MIGRATIONS (hand-written SQL) and src/schema.ts (drizzle) match what Better Auth expects
 * for our exact options, using Better Auth's own tooling:
 *  - getMigrations() (the engine behind `npx auth migrate/generate`) introspects the migrated database
 *    and must find nothing to create or add;
 *  - the drizzle adapter's schema check must report no mismatch.
 */
import { describe, it, expect, afterAll } from "vitest";
import { PostgresDialect } from "kysely";
import { getMigrations } from "better-auth/db/migration";
import { schemaCheckFor } from "@better-auth/core/db/internal";
import { createDb, CORE_MIGRATIONS, type SqlExecutor } from "@repo/database";
import { AUTH_MIGRATIONS } from "../migrations";
import { buildAuthOptions, createAuth, highestRole, personalOrgSlug } from "../auth";
import { orgScope } from "../org-scope";
import { authSchema } from "../schema";
import { SECRET } from "./helpers";

const handles: { close(): Promise<void> }[] = [];
afterAll(async () => {
  for (const h of handles) await h.close();
});

/** Minimal pg.Pool look-alike over our SqlExecutor so Kysely can introspect PGlite. */
function kyselyDialect(ex: SqlExecutor) {
  const client = {
    query: async (sql: string, params: unknown[]) => {
      const r = await ex.query(sql, params);
      return { rows: r.rows, rowCount: r.rows.length, command: "SELECT" };
    },
    release() {},
  };
  return new PostgresDialect({ pool: { connect: async () => client, end: async () => {} } as never });
}

function options(handle: ReturnType<typeof createDb>) {
  return buildAuthOptions({ handle, appName: "T", baseURL: "http://localhost:3000", secret: SECRET, cookiePrefix: "t", sendEmail: async () => {} });
}

describe("schema parity with Better Auth", () => {
  it("Better Auth would create exactly our 8 tables on an empty database", async () => {
    const handle = createDb("pglite:memory", {});
    handles.push(handle);
    const m = await getMigrations({ ...options(handle), database: { dialect: kyselyDialect(handle.executor), type: "postgres" } } as never);
    expect(m.toBeCreated.map((t) => t.table).sort()).toEqual(Object.keys(authSchema).sort());
  });

  it("finds nothing to create or add after AUTH_MIGRATIONS", async () => {
    const handle = createDb("pglite:memory", {});
    handles.push(handle);
    await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS]);
    const m = await getMigrations({ ...options(handle), database: { dialect: kyselyDialect(handle.executor), type: "postgres" } } as never);
    expect(m.toBeCreated).toEqual([]);
    expect(m.toBeAdded).toEqual([]);
    expect(m.toBeAddedIndexes).toEqual([]);
    expect(m.schemaProblems).toEqual([]);
    expect(m.unsafeChanges).toEqual([]);
  });

  it("drizzle schema passes the adapter's own schema check", async () => {
    const handle = createDb("pglite:memory", {});
    handles.push(handle);
    await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS]);
    const auth = createAuth({ handle, appName: "T", baseURL: "http://localhost:3000", secret: SECRET, cookiePrefix: "t", sendEmail: async () => {} });
    const ctx = await auth.$betterAuth.$context;
    const check = schemaCheckFor(ctx.adapter);
    expect(check).toBeTypeOf("function");
    await expect(Promise.resolve(check!())).resolves.toBeUndefined();
  });

  it("migrations are prefixed, idempotent and every table matches the drizzle schema names", async () => {
    expect(AUTH_MIGRATIONS.every((m) => m.id.startsWith("auth_"))).toBe(true);
    const handle = createDb("pglite:memory", {});
    handles.push(handle);
    await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS]);
    expect(await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS])).toEqual([]);
    const { rows } = await handle.executor.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_name LIKE 'auth\\_%' ORDER BY 1, 2`,
    );
    const { getTableColumns, getTableName } = await import("drizzle-orm");
    const expected = Object.values(authSchema)
      .flatMap((tbl) => Object.values(getTableColumns(tbl)).map((c) => `${getTableName(tbl)}.${c.name}`))
      .sort();
    expect(rows.map((r) => `${r.table_name}.${r.column_name}`).sort()).toEqual(expected);
  });

  it("contract columns exist with the right defaults", async () => {
    const handle = createDb("pglite:memory", {});
    handles.push(handle);
    await handle.migrate([...CORE_MIGRATIONS, ...AUTH_MIGRATIONS]);
    await handle.executor.query(`INSERT INTO auth_user (id, name, email) VALUES ('u1', 'n', 'e@x')`);
    const { rows } = await handle.executor.query(`SELECT role, email_verified FROM auth_user`);
    expect(rows[0]).toEqual({ role: "customer", email_verified: false });
    await expect(handle.executor.query(`INSERT INTO auth_user (id, name, email) VALUES ('u2', 'n', 'e@x')`)).rejects.toThrow();
  });
});

describe("helpers", () => {
  it("orgScope forces org_id and builds params", () => {
    const s = orgScope("org-1");
    expect(s.values({ name: "x", org_id: "attacker-org" })).toEqual({ name: "x", org_id: "org-1" });
    expect(s.params("a", 2)).toEqual(["org-1", "a", 2]);
    expect(s.assertOwns({ org_id: "org-1", id: 1 })).toEqual({ org_id: "org-1", id: 1 });
    expect(() => s.assertOwns({ org_id: "org-2" })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => s.assertOwns(null)).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => orgScope("")).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("orgScope.where produces an org_id predicate for drizzle", async () => {
    const { pgTable, text } = await import("drizzle-orm/pg-core");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const sites = pgTable("sites", { id: text("id"), org_id: text("org_id") });
    const { eq } = await import("drizzle-orm");
    const q = new PgDialect().sqlToQuery(orgScope("o1").where(sites.org_id, eq(sites.id, "s1")));
    expect(q.sql).toBe(`("sites"."org_id" = $1 and "sites"."id" = $2)`);
    expect(q.params).toEqual(["o1", "s1"]);
  });

  it("highestRole and personalOrgSlug", () => {
    expect(highestRole("member,admin")).toBe("admin");
    expect(highestRole("owner")).toBe("owner");
    expect(highestRole("superuser")).toBeNull();
    expect(personalOrgSlug("Ünïcode Name!!")).toMatch(/^unicode-name-[0-9a-f]{8}$/);
    expect(personalOrgSlug("")).toMatch(/^workspace-[0-9a-f]{8}$/);
    expect(personalOrgSlug("../../etc")).toMatch(/^etc-[0-9a-f]{8}$/);
  });
});
