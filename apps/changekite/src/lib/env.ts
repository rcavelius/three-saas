import { z } from "zod";
import { parseEnv } from "@repo/config";

/** Only used outside production so `next dev` and tests run without configuration. */
export const DEV_SESSION_SECRET = "changekite-development-only-secret-do-not-use-in-production";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const changekiteEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3001"),
    DATABASE_URL: z.string().min(1).default("pglite:./.data/changekite"),
    SESSION_SECRET: optionalString,
    CRON_SECRET: optionalString,
    /** Bearer secret for the detailed /api/health report (falls back to CRON_SECRET). */
    HEALTH_DETAILS_SECRET: optionalString,
    /** fly | cloudflare | render | xff:<n> | none (see @repo/ops clientIpConfigFromEnv). */
    TRUSTED_PROXY: z.string().default("none"),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_LIVE_MODE_AUTHORIZED: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z.string().default("ChangeKite <no-reply@localhost>"),
    SUPPORT_EMAIL: optionalString,
    OWNER_ALERT_EMAIL: optionalString,
    UPTIME_URLS: optionalString,
    RUN_SCHEDULER: optionalString,
    GIT_SHA: optionalString,
    /** Anonymous scans per client IP per hour. */
    SCAN_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().max(1000).default(5),
    /** Scans of one target host per hour (stops ChangeKite being used to hammer a site). */
    SCAN_TARGET_LIMIT_PER_HOUR: z.coerce.number().int().positive().max(1000).default(10),
    /** Concurrent anonymous scans in this process. */
    MAX_CONCURRENT_SCANS: z.coerce.number().int().positive().max(50).default(4),
    /** Monitoring scans running at once across ALL instances and orgs (DB leases). */
    MONITOR_GLOBAL_CONCURRENCY: z.coerce.number().int().positive().max(50).default(2),
    /** Scheduled scans of one target host per hour, across all orgs. */
    MONITOR_HOST_SCANS_PER_HOUR: z.coerce.number().int().positive().max(100).default(4),
    /** Support assistant (Claude). Unset key => the help center and tickets work, chat answers fall back to search. */
    ANTHROPIC_API_KEY: optionalString,
    SUPPORT_AI_MODEL: optionalString,
    SUPPORT_AI_MONTHLY_BUDGET_CENTS: z.coerce.number().int().min(0).max(10_000_000).default(500),
    SUPPORT_AI_DAILY_BUDGET_CENTS: z.coerce.number().int().min(0).max(10_000_000).optional(),
    /** Escalated tickets are emailed here (falls back to OWNER_ALERT_EMAIL). */
    SUPPORT_OPERATOR_EMAIL: optionalString,
    /** Days an anonymous report link stays valid. */
    REPORT_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(90),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === "production" && (!e.SESSION_SECRET || e.SESSION_SECRET.length < 32)) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "SESSION_SECRET (>= 32 chars) is required in production" });
    }
    if (e.SESSION_SECRET && e.SESSION_SECRET.length < 32) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "SESSION_SECRET must be at least 32 characters" });
    }
  });

export type ChangekiteEnv = z.infer<typeof changekiteEnvSchema> & { SESSION_SECRET: string };

export function parseChangekiteEnv(source: Record<string, string | undefined>): ChangekiteEnv {
  const e = parseEnv(changekiteEnvSchema, source);
  return { ...e, SESSION_SECRET: e.SESSION_SECRET ?? DEV_SESSION_SECRET };
}

let cached: ChangekiteEnv | undefined;
export function env(): ChangekiteEnv {
  cached ??= parseChangekiteEnv(process.env);
  return cached;
}

/** Stripe is usable only when both the key and the webhook secret are configured. */
export function billingConfigured(e: ChangekiteEnv): boolean {
  return Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET);
}
