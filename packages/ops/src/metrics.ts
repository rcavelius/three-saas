/**
 * Owner business metrics computed from real rows only. A metric that cannot be computed is null (with
 * the reason in `source`), never an invented number. Estimates are flagged `estimate: true`.
 * Months are UTC calendar months; "this month" = [first day of month 00:00 UTC, now].
 */
import { tableExists } from "./billing-health";
import { monthStartUtc, monthToDateCosts } from "./budgets";
import { SEVERITIES } from "./incidents";
import type { Severity, SqlExecutor } from "./types";

export interface Metric {
  value: number | null;
  unit: "cents" | "count" | "ratio";
  source: string;
  estimate?: true;
}

export interface OwnerMetrics {
  generatedAt: string;
  periodStart: string;
  mrrCents: Metric;
  activePaidSubscriptions: Metric;
  newSubscriptionsThisMonth: Metric;
  cancellationsThisMonth: Metric;
  churnRate: Metric;
  signupsThisMonth: Metric;
  conversionRate: Metric;
  pageviews30d: Metric;
  uniqueVisitors30d: Metric;
  costsMonthToDateCents: Metric & { byProvider: Record<string, number> };
  estimatedStripeFeesCents: Metric;
  estimatedOperatingContributionCents: Metric;
  deadLetters24h: Metric;
  deadLetters7d: Metric;
  openIncidents: Record<Severity, number> & { source: string };
}

export interface OwnerMetricsOptions {
  plans: { id: string; priceMonthlyCents: number }[];
  now?: Date;
  /** past_due subscriptions still count toward MRR for this many days after their last update (default 14). */
  pastDueGraceDays?: number;
}

const STRIPE_PCT = 0.029;
const STRIPE_FIXED_CENTS = 30;

export async function getOwnerMetrics(ex: SqlExecutor, opts: OwnerMetricsOptions): Promise<OwnerMetrics> {
  const now = opts.now ?? new Date();
  const monthStart = monthStartUtc(now);
  const nowIso = now.toISOString();
  const msIso = monthStart.toISOString();
  const graceDays = opts.pastDueGraceDays ?? 14;
  const prices = new Map(opts.plans.filter((p) => p.priceMonthlyCents > 0).map((p) => [p.id, p.priceMonthlyCents]));

  const hasSubs = await tableExists(ex, "billing_subscriptions");
  const hasEvents = await tableExists(ex, "billing_events");
  const hasUsers = await tableExists(ex, "auth_user");
  const hasOrgs = await tableExists(ex, "auth_organization");

  // --- Subscriptions / MRR -------------------------------------------------------------------------
  let mrr: number | null = null;
  let activePaid: number | null = null;
  const paidOrgIds: string[] = [];
  if (hasSubs) {
    const graceCutoff = new Date(now.getTime() - graceDays * 24 * 3600_000).toISOString();
    const { rows } = await ex.query<{ org_id: string; plan_id: string }>(
      `SELECT org_id, plan_id FROM billing_subscriptions
       WHERE status IN ('active', 'trialing') OR (status = 'past_due' AND updated_at >= $1)`,
      [graceCutoff],
    );
    mrr = 0;
    activePaid = 0;
    for (const r of rows) {
      const price = prices.get(r.plan_id);
      if (price === undefined) continue; // free plan or a plan id not in the catalog
      mrr += price;
      activePaid++;
      paidOrgIds.push(r.org_id);
    }
  }

  let newSubs: number | null = null;
  let cancels: number | null = null;
  if (hasEvents) {
    const { rows } = await ex.query<{ created: number; deleted: number }>(
      `SELECT
         count(*) FILTER (WHERE type = 'customer.subscription.created')::int AS created,
         count(*) FILTER (WHERE type = 'customer.subscription.deleted')::int AS deleted
       FROM billing_events WHERE created_at >= $1 AND created_at <= $2`,
      [msIso, nowIso],
    );
    newSubs = Number(rows[0]?.created ?? 0);
    cancels = Number(rows[0]?.deleted ?? 0);
  }

  let churn: number | null = null;
  let startOfMonthSubs: number | null = null;
  if (activePaid !== null && newSubs !== null && cancels !== null) {
    startOfMonthSubs = activePaid + cancels - newSubs;
    churn = startOfMonthSubs > 0 ? cancels / startOfMonthSubs : null;
  }

  // --- Signups / conversion ------------------------------------------------------------------------
  let signups: number | null = null;
  if (hasUsers) {
    const { rows } = await ex.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth_user WHERE created_at >= $1 AND created_at <= $2`,
      [msIso, nowIso],
    );
    signups = Number(rows[0]?.n ?? 0);
  }
  let conversion: number | null = null;
  let convertedOrgs: number | null = null;
  if (signups !== null && hasOrgs && hasSubs) {
    const { rows } = await ex.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth_organization
       WHERE id = ANY($1::text[]) AND created_at >= $2 AND created_at <= $3`,
      [paidOrgIds, msIso, nowIso],
    );
    convertedOrgs = Number(rows[0]?.n ?? 0);
    conversion = signups > 0 ? convertedOrgs / signups : null;
  }

  // --- Traffic ------------------------------------------------------------------------------------
  const { rows: traffic } = await ex.query<{ views: number; uniques: number }>(
    `SELECT count(*)::int AS views, count(DISTINCT anonymous_id)::int AS uniques FROM analytics_events
     WHERE name = 'pageview' AND created_at >= $1 AND created_at <= $2`,
    [new Date(now.getTime() - 30 * 24 * 3600_000).toISOString(), nowIso],
  );

  // --- Costs / estimates --------------------------------------------------------------------------
  const costs = await monthToDateCosts(ex, now);
  const fees = mrr !== null && activePaid !== null ? Math.round(mrr * STRIPE_PCT) + STRIPE_FIXED_CENTS * activePaid : null;
  const contribution = mrr !== null && fees !== null ? mrr - costs.totalCents - fees : null;

  // --- Reliability --------------------------------------------------------------------------------
  const { rows: dl } = await ex.query<{ d1: number; d7: number }>(
    `SELECT count(*) FILTER (WHERE finished_at >= $1)::int AS d1, count(*) FILTER (WHERE finished_at >= $2)::int AS d7
     FROM jobs WHERE status = 'failed'`,
    [new Date(now.getTime() - 24 * 3600_000).toISOString(), new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()],
  );
  const { rows: inc } = await ex.query<{ severity: string; n: number }>(
    `SELECT severity, count(*)::int AS n FROM incidents WHERE status = 'open' GROUP BY severity`,
  );
  const openIncidents = { info: 0, warning: 0, critical: 0, source: "incidents where status = 'open'" };
  for (const r of inc) if ((SEVERITIES as string[]).includes(r.severity)) openIncidents[r.severity as Severity] = Number(r.n);

  const missing = (t: string) => `unavailable: table ${t} does not exist in this database`;
  return {
    generatedAt: nowIso,
    periodStart: msIso,
    mrrCents: {
      value: mrr,
      unit: "cents",
      source: hasSubs
        ? `sum of catalog monthly prices for billing_subscriptions on paid plans with status active/trialing, or past_due updated within ${graceDays} days`
        : missing("billing_subscriptions"),
    },
    activePaidSubscriptions: {
      value: activePaid,
      unit: "count",
      source: hasSubs ? "billing_subscriptions counted in MRR" : missing("billing_subscriptions"),
    },
    newSubscriptionsThisMonth: {
      value: newSubs,
      unit: "count",
      source: hasEvents ? "billing_events of type customer.subscription.created this month" : missing("billing_events"),
    },
    cancellationsThisMonth: {
      value: cancels,
      unit: "count",
      source: hasEvents ? "billing_events of type customer.subscription.deleted this month" : missing("billing_events"),
    },
    churnRate: {
      value: churn,
      unit: "ratio",
      source:
        startOfMonthSubs === null
          ? "unavailable: needs billing_subscriptions and billing_events"
          : `cancellations this month / subscriptions at start of month (${startOfMonthSubs} = active now + cancellations - new)${churn === null ? "; null because there were no subscriptions at start of month" : ""}`,
    },
    signupsThisMonth: {
      value: signups,
      unit: "count",
      source: hasUsers ? "auth_user rows created this month" : missing("auth_user"),
    },
    conversionRate: {
      value: conversion,
      unit: "ratio",
      source:
        convertedOrgs === null
          ? "unavailable: needs auth_user, auth_organization and billing_subscriptions"
          : `organizations created this month that are now paid (${convertedOrgs}) / signups this month${conversion === null ? "; null because there were no signups" : ""}`,
    },
    pageviews30d: {
      value: Number(traffic[0]?.views ?? 0),
      unit: "count",
      source: "analytics_events named pageview, last 30 days",
    },
    uniqueVisitors30d: {
      value: Number(traffic[0]?.uniques ?? 0),
      unit: "count",
      source: "distinct anonymous_id on pageview events, last 30 days (cookie-less, approximate)",
    },
    costsMonthToDateCents: {
      value: costs.totalCents,
      unit: "cents",
      byProvider: costs.byProvider,
      source: "cost_entries (USD) whose period starts this month",
    },
    estimatedStripeFeesCents: {
      value: fees,
      unit: "cents",
      estimate: true,
      source: "estimate: 2.9% of MRR + 30 cents per paid subscription (Stripe US card list price; excludes tax, FX, disputes)",
    },
    estimatedOperatingContributionCents: {
      value: contribution,
      unit: "cents",
      estimate: true,
      source: "estimate: MRR - month-to-date recorded costs - estimated Stripe fees (excludes unrecorded costs and taxes)",
    },
    deadLetters24h: { value: Number(dl[0]?.d1 ?? 0), unit: "count", source: "jobs with status failed, finished in last 24 h" },
    deadLetters7d: { value: Number(dl[0]?.d7 ?? 0), unit: "count", source: "jobs with status failed, finished in last 7 days" },
    openIncidents,
  };
}
