import { z } from "zod";
import { baseEnvSchema, parseEnv } from "@repo/config";

/**
 * SiteProof env. Accounts/billing are not built yet, so SESSION_SECRET and Stripe keys are optional for now.
 */
const siteproofEnvSchema = baseEnvSchema.extend({
  APP_URL: z.string().url().default("http://localhost:3001"),
  DATABASE_URL: z.string().min(1).default("pglite:./.data/siteproof"),
  SESSION_SECRET: z.string().min(32).optional(),
  /** Anonymous scans per client IP per hour. */
  SCAN_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().max(1000).default(5),
  /** Scans of one target host per hour (stops SiteProof being used to hammer a site). */
  SCAN_TARGET_LIMIT_PER_HOUR: z.coerce.number().int().positive().max(1000).default(10),
  /** Concurrent scans in this process. */
  MAX_CONCURRENT_SCANS: z.coerce.number().int().positive().max(50).default(4),
  /**
   * Header carrying the client IP set by YOUR reverse proxy (e.g. "x-forwarded-for", "fly-client-ip",
   * "cf-connecting-ip"). Unset = do not trust any header; all anonymous clients then share one rate-limit bucket.
   */
  TRUSTED_IP_HEADER: z
    .string()
    .regex(/^[a-z0-9-]+$/i)
    .optional(),
  REPORT_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(90),
});

export type SiteproofEnv = z.infer<typeof siteproofEnvSchema>;

let cached: SiteproofEnv | undefined;
export function env(): SiteproofEnv {
  cached ??= parseEnv(siteproofEnvSchema);
  return cached;
}
