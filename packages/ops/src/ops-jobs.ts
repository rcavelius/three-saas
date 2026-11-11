/** Ready-made job handlers and schedules so each app wires ops with one call. */
import type { DbHandle } from "@repo/database";
import { checkBillingHealth } from "./billing-health";
import { checkBudgets } from "./budgets";
import { uptimeCheckJob } from "./health";
import { EMAIL_QUEUE, type Mailer } from "./mailer";
import { notifyOwner } from "./notify";
import type { ScheduleDef } from "./scheduler";
import type { FetchLike, JobHandler } from "./types";

export const OPS_QUEUES = {
  email: EMAIL_QUEUE,
  notifyOwner: "ops.notify_owner",
  checkBudgets: "ops.check_budgets",
  checkBilling: "ops.check_billing",
  uptime: "uptime.check",
} as const;

export interface OpsJobsOptions {
  handle: DbHandle<any>;
  mailer: Mailer;
  /** OWNER_ALERT_EMAIL; unset => incidents stored, heartbeat notes "owner email not configured". */
  ownerEmail?: string;
  dashboardUrl?: string;
  /** Owner-configured uptime targets (e.g. uptimeUrlsFromEnv(process.env.UPTIME_URLS)). */
  uptimeUrls?: string[];
  fetch?: FetchLike;
  /** Set false for apps without @repo/billing tables. */
  billing?: boolean;
}

export function createOpsJobs(o: OpsJobsOptions): Record<string, JobHandler> {
  const ex = o.handle.executor;
  const jobs: Record<string, JobHandler> = {
    [OPS_QUEUES.email]: o.mailer.jobHandler,
    [OPS_QUEUES.notifyOwner]: async (_p, ctx) => {
      await notifyOwner(ex, {
        mailer: o.mailer,
        brand: o.mailer.brand,
        ownerEmail: o.ownerEmail,
        dashboardUrl: o.dashboardUrl,
        now: ctx.now,
      });
    },
    [OPS_QUEUES.checkBudgets]: async (_p, ctx) => {
      await checkBudgets(ex, { now: ctx.now });
    },
  };
  if (o.billing !== false) {
    jobs[OPS_QUEUES.checkBilling] = async (_p, ctx) => {
      await checkBillingHealth(ex, { now: ctx.now });
    };
  }
  if (o.uptimeUrls && o.uptimeUrls.length > 0) {
    jobs[OPS_QUEUES.uptime] = uptimeCheckJob(ex, { urls: o.uptimeUrls, fetch: o.fetch });
  }
  return jobs;
}

/** Recommended cadence for the handlers above (only those present in `jobs`). */
export function defaultOpsSchedules(jobs: Record<string, JobHandler>): ScheduleDef[] {
  const all: ScheduleDef[] = [
    { name: OPS_QUEUES.notifyOwner, intervalSeconds: 60, maxAttempts: 3 },
    { name: OPS_QUEUES.checkBudgets, intervalSeconds: 3600, maxAttempts: 3 },
    { name: OPS_QUEUES.checkBilling, intervalSeconds: 300, maxAttempts: 3 },
    { name: OPS_QUEUES.uptime, intervalSeconds: 120, maxAttempts: 1 },
  ];
  return all.filter((s) => jobs[s.queue ?? s.name]);
}
