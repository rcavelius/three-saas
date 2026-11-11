/**
 * Server configuration from environment variables (see .env.example and docs/DEPLOYMENT.md).
 * Read once per platform instance; never imported by client components.
 */
import { clientIpConfigFromEnv, type ClientIpConfig } from "@repo/ops";

export interface AppEnv {
  appUrl: string;
  databaseUrl: string;
  sessionSecret: string;
  cronSecret?: string;
  healthDetailsSecret?: string;
  clientIp: ClientIpConfig;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  resendApiKey?: string;
  emailFrom: string;
  ownerAlertEmail?: string;
  supportEmail?: string;
  uptimeUrls?: string;
  /** Local development only: also write every outgoing email as a .txt file here (see devMailSink). */
  devMailDir?: string;
  /** Support assistant (Claude). Unset => chat falls back to help-article search. */
  anthropicApiKey?: string;
  supportAiModel?: string;
  supportAiMonthlyBudgetCents: number;
  supportAiDailyBudgetCents?: number;
  /** Escalated tickets are emailed here (falls back to ownerAlertEmail). */
  supportOperatorEmail?: string;
  production: boolean;
  version: string;
}

const DEV_SESSION_SECRET = "datapolish-local-development-secret-not-for-production";

export const DEFAULT_DATABASE_URL = "pglite:./.data/datapolish";

function opt(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function centsOr(v: string | undefined, fallback: number): number {
  const n = Number(opt(v));
  if (opt(v) === undefined) return fallback;
  if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new Error("SUPPORT_AI_*_BUDGET_CENTS must be a whole number of cents");
  return n;
}

export function loadEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const production = env.NODE_ENV === "production";
  const appUrl = new URL(opt(env.APP_URL) ?? "http://localhost:3002").origin;
  let sessionSecret = opt(env.SESSION_SECRET);
  if (!sessionSecret) {
    if (production) throw new Error("SESSION_SECRET is required in production (at least 32 characters)");
    sessionSecret = DEV_SESSION_SECRET;
  }
  return {
    appUrl,
    databaseUrl: opt(env.DATABASE_URL) ?? DEFAULT_DATABASE_URL,
    sessionSecret,
    cronSecret: opt(env.CRON_SECRET),
    healthDetailsSecret: opt(env.HEALTH_DETAILS_SECRET) ?? opt(env.CRON_SECRET),
    clientIp: clientIpConfigFromEnv(env),
    stripeSecretKey: opt(env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: opt(env.STRIPE_WEBHOOK_SECRET),
    resendApiKey: opt(env.RESEND_API_KEY),
    emailFrom: opt(env.EMAIL_FROM) ?? "DataPolish <hello@localhost>",
    ownerAlertEmail: opt(env.OWNER_ALERT_EMAIL),
    supportEmail: opt(env.SUPPORT_EMAIL),
    uptimeUrls: opt(env.UPTIME_URLS),
    devMailDir: opt(env.DEV_MAIL_DIR),
    anthropicApiKey: opt(env.ANTHROPIC_API_KEY),
    supportAiModel: opt(env.SUPPORT_AI_MODEL),
    supportAiMonthlyBudgetCents: centsOr(env.SUPPORT_AI_MONTHLY_BUDGET_CENTS, 500),
    supportAiDailyBudgetCents: opt(env.SUPPORT_AI_DAILY_BUDGET_CENTS) ? centsOr(env.SUPPORT_AI_DAILY_BUDGET_CENTS, 25) : undefined,
    supportOperatorEmail: opt(env.SUPPORT_OPERATOR_EMAIL),
    production,
    version: opt(env.GIT_SHA) ?? "dev",
  };
}

/** True for http(s)://localhost / 127.0.0.1 / [::1] app URLs (local development and the e2e server). */
export function isLocalAppUrl(appUrl: string): boolean {
  const host = new URL(appUrl).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}
