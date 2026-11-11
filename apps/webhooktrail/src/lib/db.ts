import { getPlatform, resetPlatformForTests, type WebhookTrailDb } from "./platform";

export type { WebhookTrailDb };
export { ALL_MIGRATIONS } from "./platform";

/** The process-wide database handle (owned by the platform singleton; migrations run on first use). */
export async function getDb(): Promise<WebhookTrailDb> {
  return (await getPlatform()).handle;
}

/** Test helper: close and forget the singleton. */
export async function resetDbForTests(): Promise<void> {
  await resetPlatformForTests();
}
