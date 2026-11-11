/** Routine emails (via the outbox mailer) triggered by billing hooks and usage thresholds. */
import type { PaymentFailedInfo } from "@repo/billing";
import { paymentFailedEmail, planChangedEmail, subscriptionCanceledEmail, usageNearLimitEmail } from "@repo/ops";
import type { SqlExecutor } from "@repo/database";
import { appLogger } from "./log";
import { CATALOG, limits } from "./plans";
import type { Platform } from "./platform";

const log = appLogger("notify");

/** Owner addresses of an org (billing emails go to owners only). */
export async function orgOwnerEmails(ex: SqlExecutor, orgId: string): Promise<string[]> {
  const { rows } = await ex.query<{ email: string }>(
    `SELECT DISTINCT u.email FROM auth_member m JOIN auth_user u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND 'owner' = ANY(string_to_array(replace(m.role, ' ', ''), ','))`,
    [orgId],
  );
  return rows.map((r) => r.email);
}

const planName = (id: string) => CATALOG.plans.find((p) => p.id === id)?.name ?? id;

export async function notifyPlanChanged(p: Platform, orgId: string, from: string, to: string): Promise<void> {
  for (const email of await orgOwnerEmails(p.ex, orgId)) {
    await p.mailer.send(
      planChangedEmail(p.brand, { to: email, fromPlan: planName(from), toPlan: planName(to), billingUrl: `${p.appUrl}/account/billing` }),
    );
  }
}

export async function notifyPaymentFailed(p: Platform, orgId: string, info: PaymentFailedInfo): Promise<void> {
  for (const email of await orgOwnerEmails(p.ex, orgId)) {
    await p.mailer.send(
      paymentFailedEmail(p.brand, {
        to: email,
        amountDueCents: info.amountDueCents,
        nextAttemptAt: info.nextAttemptAt,
        portalUrl: `${p.appUrl}/account/billing`,
      }),
    );
  }
}

export async function notifySubscriptionCanceled(p: Platform, orgId: string): Promise<void> {
  const ent = await p.billing.getEntitlements(orgId);
  for (const email of await orgOwnerEmails(p.ex, orgId)) {
    await p.mailer.send(
      subscriptionCanceledEmail(p.brand, {
        to: email,
        planName: planName(ent.subscribedPlanId),
        accessUntil: ent.cancelAtPeriodEnd ? ent.currentPeriodEnd : null,
        billingUrl: `${p.appUrl}/account/billing`,
      }),
    );
  }
}

/**
 * Sends the "usage near limit" email once per org, metric and period when usage crosses the warn
 * ratio. The (org, metric, period) primary key makes it exactly-once under concurrent captures.
 * Anonymous owners ("anon:*" usage keys) have no email address and are skipped.
 */
export async function maybeNotifyUsage(
  p: Platform,
  orgId: string,
  metric: string,
  used: number,
  limit: number,
  period: string,
): Promise<void> {
  if (limit <= 0 || orgId.startsWith("anon:")) return;
  if (used < Math.ceil(limit * limits.usageWarnRatio)) return;
  try {
    const { rows } = await p.ex.query<{ org_id: string }>(
      `INSERT INTO hp_usage_alerts (org_id, metric, period) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING org_id`,
      [orgId, metric, period],
    );
    if (rows.length === 0) return;
    for (const email of await orgOwnerEmails(p.ex, orgId)) {
      await p.mailer.send(
        usageNearLimitEmail(p.brand, {
          to: email,
          metricLabel: "captured requests",
          used,
          limit,
          upgradeUrl: `${p.appUrl}/pricing`,
        }),
      );
    }
  } catch (err) {
    log.warn("usage notification failed", { orgId, metric, error: (err as Error).message });
  }
}
