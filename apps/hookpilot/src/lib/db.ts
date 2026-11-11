import { getPlatform, resetPlatformForTests, type HookPilotDb } from "./platform";

export type { HookPilotDb };
export { ALL_MIGRATIONS } from "./platform";

/** The process-wide database handle (owned by the platform singleton; migrations run on first use). */
export async function getDb(): Promise<HookPilotDb> {
  return (await getPlatform()).handle;
}

/** Test helper: close and forget the singleton. */
export async function resetDbForTests(): Promise<void> {
  await resetPlatformForTests();
}
