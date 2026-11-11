/**
 * Plan limits come from the shared billing catalog (HOOKPILOT_CATALOG in @repo/billing): prices,
 * endpoint counts, quotas and payload caps are never hardcoded here. Enforcement always reads the
 * org's server-side entitlements (billing.getEntitlements); anonymous endpoints get the free plan.
 */
import { getFreePlan, HOOKPILOT_CATALOG, type PlanDef } from "@repo/billing";

export const CATALOG = HOOKPILOT_CATALOG;
export const FREE_PLAN: PlanDef = getFreePlan(CATALOG);

export type PlanId = string;

/** The limits HookPilot enforces, derived from a plan's catalog limits/features. */
export interface PlanLimits {
  planId: string;
  planName: string;
  /** Active endpoints per org (-1 = unlimited). */
  endpoints: number;
  /** Lifetime of an endpoint on this plan; null = paid endpoints never expire. */
  endpointTtlHours: number | null;
  /** Requests kept per endpoint; the oldest are pruned beyond this. */
  requestsStored: number;
  /** Captured requests per org per calendar month (UTC). */
  requestsPerMonth: number;
  /** Captured requests older than this are deleted by the retention job. */
  historyDays: number;
  /** Bytes of each request body that are stored (the rest is dropped and the request flagged truncated). */
  storedBodyBytes: number;
  /** Requests whose body exceeds this are rejected with 413. */
  maxBodyBytes: number;
  teamSeats: number;
  replay: boolean;
  capturePerEndpointPerMinute: number;
}

const KB = 1024;
const MB = 1024 * KB;

/** Per-endpoint capture rate per minute (abuse protection, not a billed limit). */
const CAPTURE_RATE: Record<string, number> = { free: 120, developer: 600, pro: 1200 };

/** Test hook: per-plan overrides applied by orgLimits (never set in application code). */
export const testOverrides: { byPlan: Record<string, Partial<PlanLimits>> } = { byPlan: {} };

export function limitsFromPlan(planId: string, limits: Record<string, number>, features: Record<string, boolean>, planName?: string): PlanLimits {
  const isFree = planId === CATALOG.freePlanId;
  const base: PlanLimits = {
    planId,
    planName: planName ?? CATALOG.plans.find((p) => p.id === planId)?.name ?? planId,
    endpoints: limits.endpoints ?? FREE_PLAN.limits.endpoints!,
    endpointTtlHours: isFree ? (limits.endpointRetentionHours ?? 24) : null,
    requestsStored: limits.requestsStored ?? FREE_PLAN.limits.requestsStored!,
    requestsPerMonth: limits.requestsPerMonth ?? FREE_PLAN.limits.requestsPerMonth!,
    historyDays: limits.historyDays ?? FREE_PLAN.limits.historyDays!,
    storedBodyBytes: (limits.storedBodyKb ?? FREE_PLAN.limits.storedBodyKb!) * KB,
    maxBodyBytes: (limits.maxPayloadKb ?? FREE_PLAN.limits.maxPayloadKb!) * KB,
    teamSeats: limits.teamSeats ?? 1,
    replay: Boolean(features.replay),
    capturePerEndpointPerMinute: CAPTURE_RATE[planId] ?? CAPTURE_RATE.free!,
  };
  const o = testOverrides.byPlan[planId];
  return o ? { ...base, ...o } : base;
}

/** Free plan limits (anonymous endpoints). A getter so test overrides apply. */
export const FREE_LIMITS: PlanLimits = new Proxy({} as PlanLimits, {
  get: (_t, k) => limitsFromPlan(FREE_PLAN.id, FREE_PLAN.limits, FREE_PLAN.features, FREE_PLAN.name)[k as keyof PlanLimits],
  ownKeys: () => Reflect.ownKeys(limitsFromPlan(FREE_PLAN.id, FREE_PLAN.limits, FREE_PLAN.features, FREE_PLAN.name)),
  getOwnPropertyDescriptor: (_t, k) => ({
    enumerable: true,
    configurable: true,
    value: limitsFromPlan(FREE_PLAN.id, FREE_PLAN.limits, FREE_PLAN.features, FREE_PLAN.name)[k as keyof PlanLimits],
  }),
});

export function planLimitsFor(planId: string): PlanLimits {
  const p = CATALOG.plans.find((x) => x.id === planId) ?? FREE_PLAN;
  return limitsFromPlan(p.id, p.limits, p.features, p.name);
}

/**
 * Runtime knobs not tied to a plan. Exported as a mutable object so tests can lower them;
 * application code must treat it as read-only.
 */
export const limits = {
  capturePerIpPerMinute: 240,
  createPerIpPerHour: 10,
  apiPerIpPerMinute: 600,
  /** Free endpoints can be extended up to this lifetime, counted from creation. */
  freeMaxLifetimeHours: 24 * 7,
  responseBodyMaxBytes: 4 * KB,
  nameMaxLength: 80,
  storedPathMaxLength: 2048,
  storedQueryMaxLength: 8192,
  storedHeaderCount: 200,
  storedHeaderValueMaxLength: 8192,
  ownerCookieMaxAgeSeconds: 60 * 60 * 24 * 30,
  /** Replay rate limits (user-initiated replays and verification attempts). */
  replayPerOrgPerMinute: 30,
  replayPerDestinationPerMinute: 10,
  verifyPerOrgPerMinute: 10,
  verifyPerDestinationPerMinute: 3,
  destinationsPerOrg: 20,
  /** Usage-near-limit email threshold. */
  usageWarnRatio: 0.8,
};

export function formatBytesShort(n: number): string {
  if (n >= MB) return `${Math.round((n / MB) * 10) / 10} MB`;
  if (n >= KB) return `${Math.round(n / KB)} KB`;
  return `${n} B`;
}

export function formatHours(h: number): string {
  if (h % 24 === 0) return h === 24 ? "24 hours" : `${h / 24} days`;
  return `${h} hours`;
}

export function formatCount(n: number): string {
  return n === -1 ? "Unlimited" : n.toLocaleString("en-US");
}

export function priceLabel(p: PlanDef): string {
  return `$${(p.priceMonthlyCents / 100).toFixed(p.priceMonthlyCents % 100 === 0 ? 0 : 2)}`;
}
