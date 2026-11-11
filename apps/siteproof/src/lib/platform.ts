/**
 * Server-only composition root: one DB handle, auth, mailer, billing, scheduler and monitoring jobs.
 * `getPlatform()` is the process-wide singleton (kept on globalThis so Next dev reloads reuse it);
 * tests build their own with `createPlatform()` and install it with `installPlatform()`.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AUTH_MIGRATIONS, createAuth, type AppAuth, type AuthEmailTemplates } from "@repo/auth";
import {
  BILLING_MIGRATIONS,
  BillingError,
  SITEPROOF_CATALOG,
  createBilling,
  getPlan,
  stripeGatewayFromEnv,
  type Billing,
  type StripeGateway,
} from "@repo/billing";
import { CORE_MIGRATIONS, coreSchema, createDb, type DbHandle, type SqlExecutor } from "@repo/database";
import { createLogger, type Logger } from "@repo/monitoring";
import {
  OPS_MIGRATIONS,
  clientIpConfigFromEnv,
  createMailer,
  createOpsJobs,
  createScheduler,
  defaultOpsSchedules,
  paymentFailedEmail,
  planChangedEmail,
  raiseIncident,
  renderBrandedEmail,
  subscriptionCanceledEmail,
  uptimeUrlsFromEnv,
  type Brand,
  type ClientIpConfig,
  type JobHandler,
  type Mailer,
  type Scheduler,
} from "@repo/ops";
import { SITEPROOF_MIGRATIONS } from "./migrations";
import { billingConfigured, env as loadEnv, type SiteproofEnv } from "./env";
import { createProductionDeps } from "./scanner/deps";
import type { ScanDeps } from "./scanner/types";
import { deleteExpiredScans } from "./scans-repo";
import { enforceSiteLimits, purgeOrgData } from "./monitoring/sites";
import { SCAN_SITE_QUEUE, scheduleDueSites, siteScanJobHandler, type MonitorDeps } from "./monitoring/monitor";
import { dispatchPendingAlerts } from "./monitoring/alerts";

export const ALL_MIGRATIONS = [...CORE_MIGRATIONS, ...AUTH_MIGRATIONS, ...BILLING_MIGRATIONS, ...OPS_MIGRATIONS, ...SITEPROOF_MIGRATIONS];

/** Internal header carrying the client IP resolved with TRUSTED_PROXY; any client-sent value is removed. */
export const CLIENT_IP_HEADER = "x-siteproof-client-ip";

export interface Platform {
  env: SiteproofEnv;
  handle: DbHandle<typeof coreSchema>;
  auth: AppAuth;
  mailer: Mailer;
  billing: Billing;
  billingEnabled: boolean;
  scheduler: Scheduler;
  brand: Brand;
  clientIp: ClientIpConfig;
  logger: Logger;
  monitor: MonitorDeps;
  now: () => Date;
}

export interface PlatformOptions {
  env: SiteproofEnv;
  /** Pre-built handle (tests); otherwise opened from DATABASE_URL and migrated. */
  handle?: DbHandle<typeof coreSchema>;
  /** Stripe gateway override (tests: FakeStripe). */
  stripe?: StripeGateway;
  scanDeps?: () => ScanDeps;
  now?: () => Date;
  logger?: Logger;
  /** Tests only. */
  authRateLimit?: boolean;
  scanLimitOverrides?: MonitorDeps["scanLimitOverrides"];
}

export async function openDb(url: string): Promise<DbHandle<typeof coreSchema>> {
  if (url.startsWith("pglite:") && url !== "pglite:memory") {
    mkdirSync(dirname(resolve(url.slice("pglite:".length))), { recursive: true });
  }
  const handle = createDb(url, coreSchema);
  await handle.migrate(ALL_MIGRATIONS);
  return handle;
}

/** A gateway for deployments without Stripe keys: every call fails with a clear 503. */
export function unconfiguredStripeGateway(): StripeGateway {
  const fail = async (): Promise<never> => {
    throw new BillingError("price_not_configured", "Billing is not configured on this server yet.", 503);
  };
  return {
    mode: "test",
    customers: { create: fail },
    checkout: { sessions: { create: fail } },
    billingPortal: { sessions: { create: fail } },
    subscriptions: { retrieve: fail, list: async () => [], update: fail, cancel: fail },
    prices: { listByLookupKeys: async () => [] },
    webhooks: {
      constructEvent: () => {
        throw new Error("Stripe webhooks are not configured");
      },
    },
  };
}

function brandedAuthTemplates(brand: Brand): Partial<AuthEmailTemplates> {
  const r = (heading: string, paragraphs: string[], label: string, url: string, footer: string) =>
    renderBrandedEmail(brand, { heading, paragraphs, action: { label, url }, footer });
  return {
    verifyEmail: ({ url, user }) => ({
      subject: `Confirm your email for ${brand.name}`,
      ...r(
        "Confirm your email address",
        [user.name ? `Hi ${user.name},` : "Hi,", `Please confirm your email address to finish creating your ${brand.name} account.`],
        "Confirm email address",
        url,
        "The link expires in 1 hour. If you did not sign up, you can ignore this email.",
      ),
    }),
    resetPassword: ({ url, user }) => ({
      subject: `Reset your ${brand.name} password`,
      ...r(
        "Reset your password",
        [user.name ? `Hi ${user.name},` : "Hi,", `Someone asked to reset the password for your ${brand.name} account.`],
        "Choose a new password",
        url,
        "The link expires in 1 hour. Resetting signs you out on all other devices. If you did not ask for this, ignore this email.",
      ),
    }),
    invitation: ({ url, inviterName, inviterEmail, organizationName, role }) => ({
      subject: `${(inviterName || inviterEmail).replace(/[\r\n]+/g, " ")} invited you to ${organizationName.replace(/[\r\n]+/g, " ")} on ${brand.name}`,
      ...r(
        `Join ${organizationName} on ${brand.name}`,
        [`${inviterName || inviterEmail} (${inviterEmail}) invited you to join ${organizationName} as ${role}.`],
        "Accept invitation",
        url,
        "If you were not expecting this invitation, you can ignore this email.",
      ),
    }),
  };
}

export async function orgOwnerEmails(ex: SqlExecutor, orgId: string): Promise<string[]> {
  const { rows } = await ex.query<{ email: string }>(
    `SELECT u.email FROM auth_member m JOIN auth_user u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND 'owner' = ANY(string_to_array(replace(m.role, ' ', ''), ','))`,
    [orgId],
  );
  return rows.map((r) => r.email);
}

export async function createPlatform(o: PlatformOptions): Promise<Platform> {
  const e = o.env;
  const now = o.now ?? (() => new Date());
  const logger = o.logger ?? createLogger({ app: "siteproof" });
  const handle = o.handle ?? (await openDb(e.DATABASE_URL));
  if (o.handle) await handle.migrate(ALL_MIGRATIONS);
  const appUrl = new URL(e.APP_URL).origin;
  const brand: Brand = { name: "SiteProof", url: appUrl, primaryColor: "#1d3a66", supportEmail: e.SUPPORT_EMAIL };
  const mailer = createMailer({ handle, from: e.EMAIL_FROM, resendApiKey: e.RESEND_API_KEY, brand, now, logger: logger.child({ part: "mailer" }) });
  const clientIp = clientIpConfigFromEnv({ TRUSTED_PROXY: e.TRUSTED_PROXY });

  const billingEnabled = Boolean(o.stripe) || billingConfigured(e);
  const stripe = o.stripe ?? (billingConfigured(e) ? stripeGatewayFromEnv(e as unknown as Record<string, string | undefined>) : unconfiguredStripeGateway());
  const planName = (id: string) => getPlan(SITEPROOF_CATALOG, id)?.name ?? id;

  // Late-bound: billing hooks need the billing instance itself.
  let billingRef: Billing | null = null;
  const billing = createBilling({
    handle,
    catalog: SITEPROOF_CATALOG,
    stripe,
    webhookSecret: e.STRIPE_WEBHOOK_SECRET ?? "whsec_not_configured",
    appUrl,
    now,
    paths: {
      checkoutSuccess: "/account/billing?checkout=success",
      checkoutCancel: "/account/billing?checkout=canceled",
      portalReturn: "/account/billing",
    },
    hooks: {
      onPlanChanged: async (orgId, from, to) => {
        await enforceSiteLimits({ handle, billing: billingRef! }, orgId);
        for (const to_ of await orgOwnerEmails(handle.executor, orgId)) {
          await mailer.send(planChangedEmail(brand, { to: to_, fromPlan: planName(from), toPlan: planName(to), billingUrl: `${appUrl}/account/billing` }));
        }
      },
      onPaymentFailed: async (orgId, info) => {
        for (const to of await orgOwnerEmails(handle.executor, orgId)) {
          await mailer.send(
            paymentFailedEmail(brand, { to, amountDueCents: info.amountDueCents, portalUrl: `${appUrl}/account/billing`, nextAttemptAt: info.nextAttemptAt }),
          );
        }
      },
      onSubscriptionCanceled: async (orgId) => {
        await enforceSiteLimits({ handle, billing: billingRef! }, orgId);
        const ents = await billingRef!.getEntitlements(orgId);
        for (const to of await orgOwnerEmails(handle.executor, orgId)) {
          await mailer.send(
            subscriptionCanceledEmail(brand, { to, planName: planName(ents.subscribedPlanId), accessUntil: null, billingUrl: `${appUrl}/account/billing` }),
          );
        }
      },
      onAnomaly: async (a) => {
        await raiseIncident(
          handle.executor,
          {
            fingerprint: `billing:${a.kind}${a.orgId ? `:${a.orgId}` : ""}`,
            severity: a.kind === "hook_failed" ? "warning" : "critical",
            source: "billing",
            title: `Billing anomaly: ${a.kind}`,
            details: { message: a.message, orgId: a.orgId, eventId: a.eventId },
          },
          { now: now() },
        );
      },
    },
  });
  billingRef = billing;

  const auth = createAuth({
    handle,
    appName: "SiteProof",
    baseURL: appUrl,
    secret: e.SESSION_SECRET,
    cookiePrefix: "sp",
    sendEmail: async (m) => {
      await mailer.send(m);
    },
    emailTemplates: brandedAuthTemplates(brand),
    onBeforeUserDelete: async (_userId, orgIds) => {
      for (const orgId of orgIds) {
        await billing.cancelImmediately(orgId);
        await purgeOrgData(handle.executor, orgId);
      }
    },
    getMemberLimit: async (orgId) => (await billing.getEntitlements(orgId)).limits.teamSeats ?? 1,
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    rateLimitEnabled: o.authRateLimit ?? true,
  });

  const monitor: MonitorDeps = {
    handle,
    billing,
    scanDeps: o.scanDeps ?? (() => createProductionDeps(appUrl)),
    logger: logger.child({ part: "monitor" }),
    globalConcurrency: e.MONITOR_GLOBAL_CONCURRENCY,
    hostScansPerHour: e.MONITOR_HOST_SCANS_PER_HOUR,
    now,
    scanLimitOverrides: o.scanLimitOverrides,
  };
  const dispatch = (siteId?: string) => dispatchPendingAlerts({ handle, billing, mailer, appUrl, now }, { siteId });

  const opsJobs = createOpsJobs({
    handle,
    mailer,
    ownerEmail: e.OWNER_ALERT_EMAIL,
    dashboardUrl: `${appUrl}/admin`,
    uptimeUrls: uptimeUrlsFromEnv(e.UPTIME_URLS),
  });
  const appJobs: Record<string, JobHandler> = {
    "billing.reconcile": async () => {
      await billing.reconcile();
    },
    "sites.schedule": async () => {
      await scheduleDueSites(monitor);
    },
    [SCAN_SITE_QUEUE]: siteScanJobHandler(monitor, async (siteId) => {
      await dispatch(siteId);
    }),
    "alerts.dispatch": async () => {
      await dispatch();
    },
    "sites.enforce_limits": async () => {
      const { rows } = await handle.executor.query<{ org_id: string }>(`SELECT DISTINCT org_id FROM sites`);
      for (const r of rows) await enforceSiteLimits({ handle, billing }, r.org_id);
    },
    "scans.cleanup": async (_p, ctx) => {
      const n = await deleteExpiredScans(handle.executor, { now: ctx.now });
      await handle.executor.query(`DELETE FROM site_issues WHERE resolved_at < $1`, [new Date(ctx.now.getTime() - 400 * 86_400_000).toISOString()]);
      await handle.executor.query(`DELETE FROM alerts WHERE created_at < $1`, [new Date(ctx.now.getTime() - 400 * 86_400_000).toISOString()]);
      await handle.executor.query(`DELETE FROM rate_limits WHERE window_start < $1`, [new Date(ctx.now.getTime() - 2 * 86_400_000).toISOString()]);
      ctx.logger.info("cleanup", { scansDeleted: n });
    },
  };
  const jobs = { ...opsJobs, ...appJobs };
  const scheduler = createScheduler({
    handle,
    jobs,
    logger: logger.child({ part: "scheduler" }),
    now,
    jobTimeoutMs: 240_000,
    schedules: [
      ...defaultOpsSchedules(opsJobs),
      ...(billingEnabled ? [{ name: "billing.reconcile", intervalSeconds: 3600, maxAttempts: 3 }] : []),
      { name: "sites.schedule", intervalSeconds: 60, maxAttempts: 2 },
      { name: "alerts.dispatch", intervalSeconds: 300, maxAttempts: 3 },
      { name: "sites.enforce_limits", intervalSeconds: 3600, maxAttempts: 3 },
      { name: "scans.cleanup", intervalSeconds: 3600, maxAttempts: 3 },
    ],
  });

  return { env: e, handle, auth, mailer, billing, billingEnabled, scheduler, brand, clientIp, logger, monitor, now };
}

const g = globalThis as unknown as { __siteproofPlatform?: Promise<Platform> };

export function getPlatform(): Promise<Platform> {
  if (!g.__siteproofPlatform) {
    g.__siteproofPlatform = createPlatform({ env: loadEnv() }).catch((err) => {
      g.__siteproofPlatform = undefined;
      throw err;
    });
  }
  return g.__siteproofPlatform;
}

/** Tests: make route handlers use this platform. */
export function installPlatform(p: Platform | null): void {
  g.__siteproofPlatform = p ? Promise.resolve(p) : undefined;
}
