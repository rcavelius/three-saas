/**
 * Billing pipeline health from @repo/billing's tables (read-only):
 *  - critical `billing:webhook_backlog`: billing_events not processed (or errored) 15+ minutes after receipt.
 *  - warning `billing:no_webhooks`: paid subscriptions exist but no webhook arrived for N days
 *    (Stripe sends at least invoice events every billing cycle; silence usually means a broken endpoint
 *    or rotated secret).
 * Both auto-resolve when healthy. Skipped when the billing tables do not exist.
 */
import { autoResolve, raiseIncident } from "./incidents";
import type { SqlExecutor } from "./types";

export async function tableExists(ex: SqlExecutor, name: string): Promise<boolean> {
  const { rows } = await ex.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [name]);
  return Boolean(rows[0]?.t);
}

export interface BillingHealth {
  skipped: boolean;
  stuckEvents: number;
  paidSubscriptions: number;
  lastWebhookAt: string | null;
  issues: string[];
}

export async function checkBillingHealth(
  ex: SqlExecutor,
  opts: { now?: Date; stuckAfterMinutes?: number; silentDays?: number } = {},
): Promise<BillingHealth> {
  const now = opts.now ?? new Date();
  const result: BillingHealth = { skipped: false, stuckEvents: 0, paidSubscriptions: 0, lastWebhookAt: null, issues: [] };
  if (!(await tableExists(ex, "billing_events")) || !(await tableExists(ex, "billing_subscriptions"))) {
    return { ...result, skipped: true };
  }
  const cutoff = new Date(now.getTime() - (opts.stuckAfterMinutes ?? 15) * 60_000).toISOString();
  const { rows } = await ex.query<{ stuck: number; errored: number; last: Date | null; paid: number }>(
    `SELECT
       (SELECT count(*)::int FROM billing_events
         WHERE processed_at IS NULL AND COALESCE(received_at, created_at) < $1) AS stuck,
       (SELECT count(*)::int FROM billing_events
         WHERE processed_at IS NULL AND error IS NOT NULL AND COALESCE(received_at, created_at) < $1) AS errored,
       (SELECT max(COALESCE(received_at, created_at)) FROM billing_events) AS last,
       (SELECT count(*)::int FROM billing_subscriptions
         WHERE stripe_subscription_id IS NOT NULL AND status IN ('active', 'trialing', 'past_due')) AS paid`,
    [cutoff],
  );
  const r = rows[0]!;
  result.stuckEvents = Number(r.stuck);
  result.paidSubscriptions = Number(r.paid);
  result.lastWebhookAt = r.last ? new Date(r.last).toISOString() : null;

  if (result.stuckEvents > 0) {
    result.issues.push("webhook_backlog");
    await raiseIncident(
      ex,
      {
        fingerprint: "billing:webhook_backlog",
        severity: "critical",
        source: "billing",
        title: `${result.stuckEvents} Stripe webhook event(s) unprocessed for over ${opts.stuckAfterMinutes ?? 15} minutes`,
        details: { stuck: result.stuckEvents, errored: Number(r.errored) },
      },
      { now },
    );
  } else {
    await autoResolve(ex, "billing:webhook_backlog", { now });
  }

  const silentMs = (opts.silentDays ?? 7) * 24 * 3600_000;
  const silent = !r.last || now.getTime() - new Date(r.last).getTime() > silentMs;
  if (result.paidSubscriptions > 0 && silent) {
    result.issues.push("no_webhooks");
    await raiseIncident(
      ex,
      {
        fingerprint: "billing:no_webhooks",
        severity: "warning",
        source: "billing",
        title: `No Stripe webhook received in ${opts.silentDays ?? 7} days while paid subscriptions exist`,
        details: { paidSubscriptions: result.paidSubscriptions, lastWebhookAt: result.lastWebhookAt },
      },
      { now },
    );
  } else {
    await autoResolve(ex, "billing:no_webhooks", { now });
  }
  return result;
}
