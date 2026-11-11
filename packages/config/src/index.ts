import { z } from "zod";

/**
 * Server env shared by every app. Optional integrations (Stripe, email, AI) are optional here so the
 * apps run locally in "test mode" without credentials; features that need them check `integrations`.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1).default("pglite:./.data/db"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OWNER_ALERT_EMAIL: z.string().email().optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export function parseEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined> = process.env): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export function integrations(env: BaseEnv) {
  return {
    stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    stripeLiveMode: Boolean(env.STRIPE_SECRET_KEY?.startsWith("sk_live_")),
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    ai: Boolean(env.ANTHROPIC_API_KEY),
  };
}

/** Local dev ports, fixed so the apps can run side by side. */
export const DEV_PORTS = { siteproof: 3001, datapolish: 3002, hookpilot: 3003 } as const;
