/** WebhookTrail's scheduled jobs and job queues (run by the @repo/ops scheduler). */
import type { JobHandler, ScheduleDef } from "@repo/ops";
import { runRetention } from "./cleanup";
import { appLogger } from "./log";
import { enforceOwnerLimits, enforcePlanLimits } from "./org-data";
import type { Platform } from "./platform";
import { REPLAY_QUEUE, runScheduledReplay } from "./replay";

const log = appLogger("jobs");

export const APP_QUEUES = {
  retention: "webhooktrail.retention",
  enforceLimits: "webhooktrail.enforce_limits",
  billingReconcile: "billing.reconcile",
  replay: REPLAY_QUEUE,
} as const;

export function appJobs(p: Platform): Record<string, JobHandler> {
  const jobs: Record<string, JobHandler> = {
    [APP_QUEUES.retention]: async (_payload, ctx) => {
      const r = await runRetention(p, { now: ctx.now });
      log.info("retention", { ...r });
    },
    [APP_QUEUES.enforceLimits]: async (_payload, ctx) => {
      const { rows } = await p.ex.query<{ org_id: string }>(
        `SELECT DISTINCT org_id FROM endpoints WHERE org_id IS NOT NULL AND deleted_at IS NULL`,
      );
      for (const { org_id } of rows) await enforcePlanLimits(p, org_id, ctx.now);
      // Anonymous owners that used a one-time pass: after it ends, endpoints above the free count are locked
      // (exactly like a workspace downgrade). Links are deleted a few days after the pass ended.
      const { rows: anon } = await p.ex.query<{ hash: string }>(
        `SELECT DISTINCT substr(owner_key, 6) AS hash FROM hp_pass_links WHERE owner_key LIKE 'anon:%'`,
      );
      for (const { hash } of anon) await enforceOwnerLimits(p, { anonHash: hash }, ctx.now);
    },
    [APP_QUEUES.replay]: async (payload) => {
      if (typeof payload.replayId !== "string") return;
      await runScheduledReplay(p, payload.replayId);
    },
  };
  if (p.billingConfigured) {
    jobs[APP_QUEUES.billingReconcile] = async () => {
      const r = await p.billing.reconcile();
      log.info("billing reconcile", { ...r });
    };
  }
  return jobs;
}

export function appSchedules(p: Platform): ScheduleDef[] {
  const s: ScheduleDef[] = [
    { name: APP_QUEUES.retention, intervalSeconds: 15 * 60, maxAttempts: 3 },
    { name: APP_QUEUES.enforceLimits, intervalSeconds: 3600, maxAttempts: 3 },
  ];
  if (p.billingConfigured) s.push({ name: APP_QUEUES.billingReconcile, intervalSeconds: 3600, maxAttempts: 3 });
  return s;
}
