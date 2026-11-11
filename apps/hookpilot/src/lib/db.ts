import { mkdirSync } from "node:fs";
import { createDb, CORE_MIGRATIONS, type DbHandle } from "@repo/database";
import { HOOKPILOT_MIGRATIONS } from "./migrations";
import { schema, type HookPilotSchema } from "./schema";

export type HookPilotDb = DbHandle<HookPilotSchema>;

export const ALL_MIGRATIONS = [...CORE_MIGRATIONS, ...HOOKPILOT_MIGRATIONS];

const g = globalThis as unknown as { __hookpilotDb?: Promise<HookPilotDb> };

/** Process-wide singleton (survives Next dev hot reloads); migrations run on first use. */
export function getDb(): Promise<HookPilotDb> {
  if (!g.__hookpilotDb) {
    g.__hookpilotDb = (async () => {
      const url = process.env.DATABASE_URL || "pglite:./.data/hookpilot";
      if (url.startsWith("pglite:")) {
        const target = url.slice("pglite:".length);
        if (target && target !== "memory") mkdirSync(target, { recursive: true });
      }
      const handle = createDb(url, schema);
      await handle.migrate(ALL_MIGRATIONS);
      return handle;
    })().catch((err) => {
      g.__hookpilotDb = undefined;
      throw err;
    });
  }
  return g.__hookpilotDb;
}

/** Test helper: close and forget the singleton. */
export async function resetDbForTests(): Promise<void> {
  const current = g.__hookpilotDb;
  g.__hookpilotDb = undefined;
  if (current) await (await current).close();
}
