import { createLogger, type Logger } from "@repo/monitoring";

/** App logger (JSON lines, secrets redacted by @repo/monitoring). Silent under vitest. */
export function appLogger(component: string): Logger {
  const silent = process.env.NODE_ENV === "test" || process.env.VITEST;
  return createLogger({ app: "webhooktrail", component }, silent ? () => undefined : undefined);
}
