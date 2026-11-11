/**
 * Server composition for DataPolish: one database handle, auth, billing, mailer and scheduler.
 *
 * The database stores accounts, organizations, billing state, ops data (jobs, incidents, outbox,
 * first-party analytics) and saved workflows. It NEVER stores spreadsheet contents: files are read,
 * cleaned and exported in the browser, and no API route accepts file data.
 *
 * Next route handlers call getPlatform(); tests call createPlatform() with an in-memory database and
 * FakeStripe.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createAuth, type AppAuth, type EmailMessage } from "@repo/auth";
import {
  BillingError,
  createBilling,
  DATAPOLISH_CATALOG,
  getPlan,
  stripeGatewayFromEnv,
  type Billing,
  type StripeGateway,
} from "@repo/billing";
import { createDb, type DbHandle } from "@repo/database";
import { createLogger, type Logger } from "@repo/monitoring";
import {
  createMailer,
  createOpsJobs,
  createScheduler,
  defaultOpsSchedules,
  paymentFailedEmail,
  planChangedEmail,
  raiseIncident,
  subscriptionCanceledEmail,
  uptimeUrlsFromEnv,
  type Brand,
  type JobHandler,
  type Mailer,
  type Scheduler,
} from "@repo/ops";
import { authEmailTemplates } from "./emails";
import { isLocalAppUrl, loadEnv, type AppEnv } from "./env";
import { ALL_MIGRATIONS } from "./migrations";
import { workflowRepo, type WorkflowRepo } from "./workflows";

export const CATALOG = DATAPOLISH_CATALOG;
export const COOKIE_PREFIX = "dp";
/** Header the auth route sets from the trusted-proxy client IP (any client-sent value is overwritten). */
export const CLIENT_IP_HEADER = "x-dp-client-ip";

export interface Platform {
  env: AppEnv;
  handle: DbHandle<any>;
  auth: AppAuth;
  billing: Billing;
  billingConfigured: boolean;
  mailer: Mailer;
  scheduler: Scheduler;
  workflows: WorkflowRepo;
  brand: Brand;
  logger: Logger;
  now: () => Date;
  /** Emails of the owners of an organization (for billing notices). */
  ownerEmails(orgId: string): Promise<string[]>;
}

export interface PlatformOptions {
  env?: AppEnv;
  handle?: DbHandle<any>;
  /** null = billing not configured. Default: from STRIPE_SECRET_KEY, or null when unset. */
  stripe?: StripeGateway | null;
  now?: () => Date;
  logger?: Logger;
  /** Tests only. Auth rate limiting is on everywhere else. */
  authRateLimit?: boolean;
  /** Extra outgoing-email observer (tests). */
  onEmail?: (m: EmailMessage) => void;
}

/** Stand-in gateway when no Stripe key is configured: every call fails with a clear 503. */
function notConfiguredGateway(): StripeGateway {
  const fail = async (): Promise<never> => {
    throw new BillingError("price_not_configured", "Billing is not configured on this server yet.", 503);
  };
  return {
    mode: "test",
    customers: { create: fail },
    checkout: { sessions: { create: fail } },
    billingPortal: { sessions: { create: fail } },
    subscriptions: { retrieve: fail, list: fail, update: fail, cancel: fail },
    prices: { listByLookupKeys: fail },
    webhooks: {
      constructEvent: () => {
        throw new Error("billing not configured");
      },
    },
  } as StripeGateway;
}

/**
 * Local development convenience: with no RESEND_API_KEY and a localhost APP_URL, DEV_MAIL_DIR makes
 * every email also land as a .txt file so verification links can be clicked. Ignored otherwise.
 */
function devMailSink(env: AppEnv): ((m: EmailMessage) => void) | null {
  if (!env.devMailDir || env.resendApiKey || !isLocalAppUrl(env.appUrl)) return null;
  const dir = path.resolve(env.devMailDir);
  return (m) => {
    mkdirSync(dir, { recursive: true });
    const safeTo = m.to.replace(/[^a-z0-9@._-]/gi, "_").slice(0, 80);
    const file = path.join(dir, `${Date.now()}-${m.tag.replace(/[^a-z0-9._-]/gi, "_")}-${safeTo}.txt`);
    writeFileSync(file, `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n`, "utf8");
  };
}

export async function createPlatform(o: PlatformOptions = {}): Promise<Platform> {
  const env = o.env ?? loadEnv();
  const now = o.now ?? (() => new Date());
  const logger = o.logger ?? createLogger({ app: "datapolish" });
  if (!o.handle && env.databaseUrl.startsWith("pglite:") && env.databaseUrl !== "pglite:memory") {
    mkdirSync(path.dirname(path.resolve(env.databaseUrl.slice("pglite:".length))), { recursive: true });
  }
  const handle = o.handle ?? createDb(env.databaseUrl, {});
  await handle.migrate(ALL_MIGRATIONS);
  const ex = handle.executor;

  const brand: Brand = { name: "DataPolish", url: env.appUrl, primaryColor: "#1a43b8", supportEmail: env.supportEmail };
  const mailer = createMailer({ handle, from: env.emailFrom, resendApiKey: env.resendApiKey, brand, now, logger });
  const sink = devMailSink(env);
  const sendEmail = async (m: EmailMessage) => {
    await mailer.send(m);
    sink?.(m);
    o.onEmail?.(m);
  };

  async function ownerEmails(orgId: string): Promise<string[]> {
    const { rows } = await ex.query<{ email: string }>(
      `SELECT u.email FROM auth_member m JOIN auth_user u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND 'owner' = ANY(string_to_array(replace(m.role, ' ', ''), ','))`,
      [orgId],
    );
    return rows.map((r) => r.email);
  }

  const planName = (id: string) => getPlan(CATALOG, id)?.name ?? id;
  const billingUrl = `${env.appUrl}/account/billing`;

  let stripe: StripeGateway | null;
  if (o.stripe !== undefined) stripe = o.stripe;
  else stripe = env.stripeSecretKey ? stripeGatewayFromEnv(process.env) : null;

  const billing = createBilling({
    handle,
    catalog: CATALOG,
    stripe: stripe ?? notConfiguredGateway(),
    // Without a configured secret no signature can verify, so every webhook is rejected (400).
    webhookSecret: env.stripeWebhookSecret ?? `unconfigured-${randomBytes(24).toString("hex")}`,
    appUrl: env.appUrl,
    now,
    paths: {
      checkoutSuccess: "/account/billing?checkout=success",
      checkoutCancel: "/account/billing?checkout=canceled",
      portalReturn: "/account/billing",
    },
    hooks: {
      async onPlanChanged(orgId, from, to) {
        for (const to_ of await ownerEmails(orgId)) {
          await mailer.send(planChangedEmail(brand, { to: to_, fromPlan: planName(from), toPlan: planName(to), billingUrl }));
        }
      },
      async onPaymentFailed(orgId, info) {
        for (const to of await ownerEmails(orgId)) {
          await mailer.send(paymentFailedEmail(brand, { to, amountDueCents: info.amountDueCents, portalUrl: billingUrl, nextAttemptAt: info.nextAttemptAt }));
        }
      },
      async onSubscriptionCanceled(orgId) {
        const ent = await billing.getEntitlements(orgId);
        for (const to of await ownerEmails(orgId)) {
          await mailer.send(subscriptionCanceledEmail(brand, { to, planName: planName(ent.subscribedPlanId), accessUntil: null, billingUrl }));
        }
      },
      async onAnomaly(a) {
        await raiseIncident(
          ex,
          {
            fingerprint: `billing:${a.kind}:${a.orgId ?? "global"}`.slice(0, 200),
            severity: a.kind === "unknown_price" || a.kind === "reconcile_failed" ? "critical" : "warning",
            source: "billing",
            title: `Billing anomaly: ${a.kind}`,
            details: { message: a.message, orgId: a.orgId ?? null, eventId: a.eventId ?? null },
          },
          { now: now() },
        );
      },
    },
  });

  const workflows = workflowRepo(handle);

  const auth = createAuth({
    handle,
    appName: "DataPolish",
    baseURL: env.appUrl,
    secret: env.sessionSecret,
    cookiePrefix: COOKIE_PREFIX,
    sendEmail,
    emailTemplates: authEmailTemplates(brand),
    // The auth route copies the trusted-proxy client IP into this header (see routes.ts), so Better
    // Auth's own rate limiter keys on the same address as every app-level limit.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    rateLimitEnabled: o.authRateLimit ?? true,
    getMemberLimit: async (orgId) => (await billing.getEntitlements(orgId)).limits.teamSeats ?? 1,
    onBeforeUserDelete: async (userId, orgIds) => {
      for (const orgId of orgIds) await billing.cancelImmediately(orgId);
      await workflows.purgeOrgs(orgIds);
      if (orgIds.length) await ex.query(`DELETE FROM billing_usage WHERE org_id = ANY($1::text[])`, [orgIds]);
      // Workflows this user saved in teams that survive stay with the team, without their name on them.
      await ex.query(`UPDATE workflows SET created_by = NULL WHERE created_by = $1`, [userId]);
      // First-party analytics rows are de-linked from the person.
      await ex.query(`UPDATE analytics_events SET user_id = NULL WHERE user_id = $1`, [userId]);
    },
  });

  const opsJobs = createOpsJobs({
    handle,
    mailer,
    ownerEmail: env.ownerAlertEmail,
    dashboardUrl: `${env.appUrl}/admin`,
    uptimeUrls: uptimeUrlsFromEnv(env.uptimeUrls),
  });
  const appJobs: Record<string, JobHandler> = {
    "billing.reconcile": async () => {
      if (!stripe) return; // nothing to reconcile without Stripe
      await billing.reconcile();
    },
    "datapolish.cleanup": async (_p, ctx) => {
      const t = ctx.now;
      await ex.query(`DELETE FROM rate_limits WHERE window_start < $1`, [new Date(t.getTime() - 2 * 86_400_000).toISOString()]);
      await ex.query(`DELETE FROM auth_verification WHERE expires_at < $1`, [t.toISOString()]);
      await ex.query(`DELETE FROM auth_session WHERE expires_at < $1`, [t.toISOString()]);
      // First-party analytics are kept 13 months.
      await ex.query(`DELETE FROM analytics_events WHERE created_at < $1`, [new Date(t.getTime() - 396 * 86_400_000).toISOString()]);
    },
  };
  const jobs = { ...opsJobs, ...appJobs };
  const scheduler = createScheduler({
    handle,
    jobs,
    logger,
    now,
    schedules: [
      ...defaultOpsSchedules(opsJobs),
      { name: "billing.reconcile", intervalSeconds: 3600, maxAttempts: 3 },
      { name: "datapolish.cleanup", intervalSeconds: 86_400, maxAttempts: 3 },
    ],
  });

  return { env, handle, auth, billing, billingConfigured: stripe !== null, mailer, scheduler, workflows, brand, logger, now, ownerEmails };
}

const g = globalThis as unknown as { __datapolishPlatform?: Promise<Platform> };

/** Process-wide singleton (survives dev hot reloads). A failed start is retried on the next call. */
export function getPlatform(): Promise<Platform> {
  if (!g.__datapolishPlatform) {
    g.__datapolishPlatform = createPlatform().catch((e) => {
      g.__datapolishPlatform = undefined;
      throw e;
    });
  }
  return g.__datapolishPlatform;
}
