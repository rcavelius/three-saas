/**
 * Product analytics event names accepted by POST /api/events (client-safe: no server imports).
 * The original names come from @repo/ops DEFAULT_EVENT_NAMES and keep their free-form props. Events added here
 * list their props; the ingest route keeps only those keys (primitive values), so URLs, hosts and free text can
 * never be attached to them. Values are either a fixed set of words or "count" (a small integer).
 */
type PropSpec = "count" | readonly string[];

export const BASE_EVENT_NAMES = [
  "pageview",
  "signup_started",
  "signup_completed",
  "checkout_started",
  "checkout_completed",
  "tool_used",
  "upgrade_clicked",
  "pricing_viewed",
  "cta_clicked",
] as const;

export const EVENT_SPEC = {
  /** The report paywall was shown: reason = what is locked; hidden = number of issues withheld. */
  paywall_shown: { reason: ["report_issues"], where: ["report", "scan"], hidden: "count" },
  /** The visitor clicked the one-time pass button (Checkout is about to open). */
  pass_checkout_started: { pass: ["report"], from: ["report", "scan", "pricing"] },
  /** The visitor came back from Checkout with ?pass=<status>. */
  pass_activated: { pass: ["report"], status: ["active", "unpaid", "expired", "revoked", "invalid", "error"] },
  /** The pass checkout was abandoned (?pass=canceled). */
  pass_checkout_canceled: { pass: ["report"] },
} as const satisfies Record<string, Record<string, PropSpec>>;

export type SpecEventName = keyof typeof EVENT_SPEC;
export type EventName = (typeof BASE_EVENT_NAMES)[number] | SpecEventName;

export const ALL_EVENT_NAMES: readonly EventName[] = [...BASE_EVENT_NAMES, ...(Object.keys(EVENT_SPEC) as SpecEventName[])];

/** Per-event prop allowlist for the ingest route (only the events in EVENT_SPEC). */
export const EVENT_ALLOWED_PROPS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(EVENT_SPEC).map(([name, spec]) => [name, Object.keys(spec)]),
);
