/**
 * Server-only composition root: one database handle, auth, billing, mailer and scheduler per
 * process (singleton on globalThis so Next dev hot reloads reuse it). Route handlers call
 * getPlatform(); tests build their own with createPlatform() + installPlatformForTests().
 */
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createDb, CORE_MIGRATIONS, type SqlExecutor } from "@repo/database";
import { AUTH_MIGRATIONS, createAuth, type AppAuth } from "@repo/auth";
import {
  BILLING_MIGRATIONS,
  BillingError,
  createBilling,
  stripeGatewayFromEnv,
  type Billing,
  type StripeGateway,
} from "@repo/billing";
import {
  OPS_MIGRATIONS,
  clientIpConfigFromEnv,
  createMailer,
  createOpsJobs,
  createScheduler,
  defaultOpsSchedules,
  getClientIp,
  raiseIncident,
  type Brand,
  type ClientIpConfig,
  type FetchLike,
  type Mailer,
  type Scheduler,
} from "@repo/ops";
import type { AddressPolicy, Resolver } from "@repo/security";
import { authEmailTemplates } from "./auth-emails";
import { appJobs, appSchedules } from "./jobs";
import { appLogger } from "./log";
import { HOOKPILOT_MIGRATIONS } from "./migrations";
import { notifyPaymentFailed, notifyPlanChanged, notifySubscriptionCanceled } from "./notify";
import { enforcePlanLimits, purgeOrgData } from "./org-data";
import { CATALOG } from "./plans";
import { schema, type HookPilotSchema } from "./schema";
import type { DbHandle } from "@repo/database";

export type HookPilotDb = DbHandle<HookPilotSchema>;

export const ALL_MIGRATIONS = [...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS, ...HOOKPILOT_MIGRATIONS];

/** Header the auth route sets from getClientIp() so Better Auth rate-limits by the trusted client IP only. */
export const AUTH_IP_HEADER = "x-hp-client-ip";

export interface PlatformOptions {
  databaseUrl: string;
  appUrl: string;
  sessionSecret: string;
  /** null = billing not configured (no STRIPE_SECRET_KEY): pricing still renders, checkout answers 503. */
  stripe: StripeGateway | null;
  webhookSecret?: string;
  emailFrom: string;
  resendApiKey?: string;
  ownerEmail?: string;
  clientIp: ClientIpConfig;
  /** TESTS ONLY: @repo/security/testing loopback policy / static resolver. Production always uses the defaults. */
  replayPolicy?: AddressPolicy;
  replayResolver?: Resolver;
  /** Extra hostnames replay must never target (the app's own host is always included). */
  selfHosts?: string[];
  /** Ceiling on total stored captured requests before a usage incident is raised. */
  storedRowsCeiling?: number;
  mailerFetch?: FetchLike;
  rateLimitAuth?: boolean;
}

export interface Platform {
  handle: HookPilotDb;
  ex: SqlExecutor;
  auth: AppAuth;
  billing: Billing;
  billingConfigured: boolean;
  mailer: Mailer;
  scheduler: Scheduler;
  clientIp: ClientIpConfig;
  appUrl: string;
  brand: Brand;
  replay: { policy?: AddressPolicy; resolver?: Resolver; selfHosts: string[] };
  storedRowsCeiling: number;
}

const notConfigured = (): never => {
  throw new BillingError("price_not_configured", "Billing is not configured on this server.", 503);
};

/** Stand-in gateway when STRIPE_SECRET_KEY is unset: nothing reaches Stripe; entitlements stay free. */
export const UNCONFIGURED_STRIPE: StripeGateway = {
  mode: "test",
  customers: { create: async () => notConfigured() },
  checkout: { sessions: { create: async () => notConfigured() } },
  billingPortal: { sessions: { create: async () => notConfigured() } },
  subscriptions: {
    retrieve: async () => notConfigured(),
    list: async () => [],
    update: async () => notConfigured(),
    cancel: async () => notConfigured(),
  },
  prices: { listByLookupKeys: async () => notConfigured() },
  webhooks: {
    constructEvent: () => {
      throw new Error("Stripe webhooks are not configured");
    },
  },
};

export async function createPlatform(o: PlatformOptions): Promise<Platform> {
  if (o.databaseUrl.startsWith("pglite:")) {
    const target = o.databaseUrl.slice("pglite:".length);
    if (target && target !== "memory") mkdirSync(target, { recursive: true });
  }
  const appUrl = new URL(o.appUrl).origin;
  const handle = createDb(o.databaseUrl, schema);
  await handle.migrate(ALL_MIGRATIONS);
  const ex = handle.executor;
  const brand: Brand = { name: "HookPilot", url: appUrl, primaryColor: "#3f6212" };
  const mailer = createMailer({
    handle,
    from: o.emailFrom,
    resendApiKey: o.resendApiKey,
    brand,
    fetch: o.mailerFetch,
    logger: appLogger("mailer"),
  });

  // `p` is completed below; hooks only run after construction.
  const p = { handle, ex, appUrl, brand, mailer, clientIp: o.clientIp } as Platform;

  const billing = createBilling({
    handle,
    catalog: CATALOG,
    stripe: o.stripe ?? UNCONFIGURED_STRIPE,
    webhookSecret: o.webhookSecret || `whsec_unconfigured_${randomBytes(24).toString("hex")}`,
    appUrl,
    paths: {
      checkoutSuccess: "/account/billing?checkout=success",
      checkoutCancel: "/account/billing?checkout=canceled",
      portalReturn: "/account/billing",
    },
    hooks: {
      onPlanChanged: async (orgId, from, to) => {
        await enforcePlanLimits(p, orgId);
        await notifyPlanChanged(p, orgId, from, to);
      },
      onPaymentFailed: async (orgId, info) => notifyPaymentFailed(p, orgId, info),
      onSubscriptionCanceled: async (orgId) => {
        await enforcePlanLimits(p, orgId);
        await notifySubscriptionCanceled(p, orgId);
      },
      onAnomaly: async (a) => {
        await raiseIncident(ex, {
          fingerprint: `billing:${a.kind}${a.orgId ? `:${a.orgId}` : ""}`,
          severity: a.kind === "hook_failed" ? "warning" : "critical",
          source: "billing",
          title: `Billing anomaly: ${a.kind}`,
          details: { message: a.message, orgId: a.orgId ?? null, eventId: a.eventId ?? null },
        });
      },
    },
  });

  const auth = createAuth({
    handle,
    appName: "HookPilot",
    baseURL: appUrl,
    secret: o.sessionSecret,
    cookiePrefix: "hp",
    sendEmail: async (m) => {
      await mailer.send(m);
    },
    emailTemplates: authEmailTemplates(brand),
    // Same trusted-proxy rule as every other rate limit; client-sent IP headers are ignored.
    resolveClientIp: (h) => getClientIp(h, o.clientIp),
    rateLimitEnabled: o.rateLimitAuth ?? true,
    getMemberLimit: async (orgId) => (await billing.getEntitlements(orgId)).limits.teamSeats ?? 1,
    onBeforeUserDelete: async (_userId, orgIds) => {
      for (const orgId of orgIds) {
        if (o.stripe) await billing.cancelImmediately(orgId);
        await purgeOrgData(ex, orgId);
      }
    },
  });

  Object.assign(p, {
    auth,
    billing,
    billingConfigured: Boolean(o.stripe),
    replay: {
      policy: o.replayPolicy,
      resolver: o.replayResolver,
      selfHosts: [new URL(appUrl).hostname, ...(o.selfHosts ?? [])],
    },
    storedRowsCeiling: o.storedRowsCeiling ?? 2_000_000,
  });

  const opsJobs = createOpsJobs({
    handle,
    mailer,
    ownerEmail: o.ownerEmail,
    dashboardUrl: `${appUrl}/admin`,
  });
  const jobs = { ...opsJobs, ...appJobs(p) };
  const schedules = [...defaultOpsSchedules(opsJobs), ...appSchedules(p)];
  p.scheduler = createScheduler({ handle, jobs, schedules, logger: appLogger("scheduler") });
  return p;
}

const DEV_SESSION_SECRET = "hookpilot-dev-only-session-secret-not-for-production";

export function platformOptionsFromEnv(env: Record<string, string | undefined> = process.env): PlatformOptions {
  const production = env.NODE_ENV === "production";
  const sessionSecret = env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 ? env.SESSION_SECRET : null;
  if (!sessionSecret && production) throw new Error("SESSION_SECRET (>= 32 chars) is required in production");
  return {
    databaseUrl: env.DATABASE_URL || "pglite:./.data/hookpilot",
    appUrl: env.APP_URL || "http://localhost:3003",
    sessionSecret: sessionSecret ?? DEV_SESSION_SECRET,
    stripe: env.STRIPE_SECRET_KEY ? stripeGatewayFromEnv(env) : null,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    emailFrom: env.EMAIL_FROM || "HookPilot <noreply@hookpilot.invalid>",
    resendApiKey: env.RESEND_API_KEY || undefined,
    ownerEmail: env.OWNER_ALERT_EMAIL || undefined,
    clientIp: clientIpConfigFromEnv(env),
    selfHosts: (env.HP_SELF_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    storedRowsCeiling: env.HP_STORED_ROWS_CEILING ? Number(env.HP_STORED_ROWS_CEILING) : undefined,
  };
}

const g = globalThis as unknown as { __hookpilotPlatform?: Promise<Platform> };

export function getPlatform(): Promise<Platform> {
  if (!g.__hookpilotPlatform) {
    g.__hookpilotPlatform = createPlatform(platformOptionsFromEnv()).catch((err) => {
      g.__hookpilotPlatform = undefined;
      throw err;
    });
  }
  return g.__hookpilotPlatform;
}

/** Tests: use this platform for every route handler in the current test file. */
export function installPlatformForTests(p: Platform): void {
  g.__hookpilotPlatform = Promise.resolve(p);
}

export async function resetPlatformForTests(): Promise<void> {
  const current = g.__hookpilotPlatform;
  g.__hookpilotPlatform = undefined;
  if (current) await (await current).handle.close();
}
