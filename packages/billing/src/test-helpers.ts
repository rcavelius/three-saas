/** Shared setup for this package's own tests (not exported). */
import { createBilling, type BillingAnomaly, type BillingHooks, type PaymentFailedInfo } from "./billing";
import type { Catalog } from "./catalog";
import { CHANGEKITE_CATALOG } from "./catalogs";
import { FakeStripe, createBillingTestDb } from "./testing";

export const WEBHOOK_SECRET = "whsec_test_billingpackage_0123456789abcdef";
export const APP_URL = "https://changekite.test";
export const DAY = 86_400_000;

export async function setup(opts: { catalog?: Catalog; latencyMs?: number; hooks?: Partial<BillingHooks> } = {}) {
  const catalog = opts.catalog ?? CHANGEKITE_CATALOG;
  const clock = { t: new Date("2026-03-10T12:00:00.000Z") };
  const now = () => clock.t;
  const handle = await createBillingTestDb();
  const fake = new FakeStripe({ webhookSecret: WEBHOOK_SECRET, now, catalogs: [catalog], latencyMs: opts.latencyMs });
  const seen = {
    cancellationScheduled: [] as Array<[string, { planId: string; endsAt: Date | null }]>,
    planChanged: [] as [string, string, string][],
    paymentFailed: [] as [string, PaymentFailedInfo][],
    canceled: [] as string[],
    anomalies: [] as BillingAnomaly[],
  };
  const billing = createBilling({
    handle,
    catalog,
    stripe: fake,
    webhookSecret: WEBHOOK_SECRET,
    appUrl: APP_URL,
    now,
    hooks: {
      onPlanChanged: async (o, f, t) => void seen.planChanged.push([o, f, t]),
      onPaymentFailed: async (o, i) => void seen.paymentFailed.push([o, i]),
      onSubscriptionCanceled: async (o) => void seen.canceled.push(o),
      onCancellationScheduled: async (o, i) => void seen.cancellationScheduled.push([o, i]),
      onAnomaly: async (a) => void seen.anomalies.push(a),
      ...opts.hooks,
    },
  });
  const advance = (ms: number) => {
    clock.t = new Date(clock.t.getTime() + ms);
  };
  /** Checkout + customer pays + all webhooks delivered in order. Returns the subscription id. */
  const subscribe = async (orgId: string, planId: string) => {
    const s = await billing.createCheckoutSession(orgId, planId, `${orgId}@example.test`);
    const subId = fake.completeCheckout(s.id);
    const res = await fake.deliverAll(billing);
    for (const r of res) if (r.status !== 200) throw new Error(`webhook ${r.type} -> ${r.status} ${r.body}`);
    return subId;
  };
  const events = async () =>
    (
      await handle.executor.query<{ id: string; type: string; outcome: string | null; error: string | null; attempts: number; processed_at: Date | null }>(
        `SELECT id, type, outcome, error, attempts, processed_at FROM billing_events ORDER BY received_at, id`,
      )
    ).rows;
  return { handle, fake, billing, seen, clock, advance, subscribe, events, catalog };
}
