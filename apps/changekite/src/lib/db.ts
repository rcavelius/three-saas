import { getPlatform, openDb, ALL_MIGRATIONS } from "./platform";

export { openDb, ALL_MIGRATIONS };

/** The platform's DB handle (one per process, migrated on first use). */
export async function getDb() {
  return (await getPlatform()).handle;
}
