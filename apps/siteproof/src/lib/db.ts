import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CORE_MIGRATIONS, coreSchema, createDb, type DbHandle } from "@repo/database";
import { SITEPROOF_MIGRATIONS } from "./migrations";
import { env } from "./env";

export const ALL_MIGRATIONS = [...CORE_MIGRATIONS, ...SITEPROOF_MIGRATIONS];

type Handle = DbHandle<typeof coreSchema>;
const g = globalThis as unknown as { __siteproofDb?: Promise<Handle> };

export async function openDb(url: string): Promise<Handle> {
  if (url.startsWith("pglite:") && url !== "pglite:memory") {
    const dir = resolve(url.slice("pglite:".length));
    mkdirSync(dirname(dir), { recursive: true });
  }
  const handle = createDb(url, coreSchema);
  await handle.migrate(ALL_MIGRATIONS);
  return handle;
}

/** Process-wide singleton (survives Next dev hot reloads); migrates on first use. */
export function getDb(): Promise<Handle> {
  if (!g.__siteproofDb) {
    g.__siteproofDb = openDb(env().DATABASE_URL).catch((err) => {
      g.__siteproofDb = undefined;
      throw err;
    });
  }
  return g.__siteproofDb;
}
