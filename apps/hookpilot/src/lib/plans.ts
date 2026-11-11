/**
 * Plan limits. Only the Free plan is live this milestone; paid plans are listed on /pricing
 * as "not on sale yet" and are NOT enforced anywhere (there are no accounts or checkout yet).
 */
export type PlanId = "free" | "developer" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  /** Active endpoints per owner. */
  endpoints: number;
  /** Default and maximum time-to-live of an endpoint, counted from "now" when extending. */
  retentionHours: number;
  /** Hard cap on an endpoint's total lifetime, counted from creation. */
  maxLifetimeHours: number;
  /** Requests kept per endpoint; the oldest are pruned beyond this. */
  historyPerEndpoint: number;
  /** Bytes of each request body that are stored (the rest is dropped and the request is flagged truncated). */
  storedBodyBytes: number;
  /** Requests whose body exceeds this are rejected with 413. */
  maxBodyBytes: number;
  teamSeats: number;
  capturePerEndpointPerMinute: number;
  available: boolean;
}

const KB = 1024;
const MB = 1024 * KB;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    endpoints: 3,
    retentionHours: 24,
    maxLifetimeHours: 24 * 7,
    historyPerEndpoint: 100,
    storedBodyBytes: 256 * KB,
    maxBodyBytes: 1 * MB,
    teamSeats: 1,
    capturePerEndpointPerMinute: 120,
    available: true,
  },
  developer: {
    id: "developer",
    name: "Developer",
    priceMonthlyUsd: 9,
    endpoints: 25,
    retentionHours: 24 * 7,
    maxLifetimeHours: 24 * 90,
    historyPerEndpoint: 2_000,
    storedBodyBytes: 1 * MB,
    maxBodyBytes: 2 * MB,
    teamSeats: 1,
    capturePerEndpointPerMinute: 600,
    available: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 29,
    endpoints: 100,
    retentionHours: 24 * 30,
    maxLifetimeHours: 24 * 365,
    historyPerEndpoint: 10_000,
    storedBodyBytes: 5 * MB,
    maxBodyBytes: 10 * MB,
    teamSeats: 5,
    capturePerEndpointPerMinute: 1_200,
    available: false,
  },
};

/**
 * Runtime knobs not tied to a plan. Exported as a mutable object so tests can lower them;
 * application code must treat it as read-only.
 */
export const limits = {
  capturePerIpPerMinute: 240,
  createPerIpPerHour: 10,
  apiPerIpPerMinute: 600,
  /** Max active (unexpired, undeleted) anonymous endpoints per owner token. */
  anonActiveEndpoints: PLANS.free.endpoints,
  responseBodyMaxBytes: 4 * KB,
  nameMaxLength: 80,
  storedPathMaxLength: 2048,
  storedQueryMaxLength: 8192,
  storedHeaderCount: 200,
  storedHeaderValueMaxLength: 8192,
  ownerCookieMaxAgeSeconds: 60 * 60 * 24 * 30,
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
