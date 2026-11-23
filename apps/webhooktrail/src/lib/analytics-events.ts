/**
 * Analytics events WebhookTrail sends (lib/track.ts) and /api/events accepts. Props are fixed words only, never
 * free text: EVENT_SPEC lists each event's allowed props and values.
 */
import { DEFAULT_EVENT_NAMES } from "@repo/ops";

export const PAYWALL_REASONS = ["replay", "endpoint_limit", "expiry", "expired", "stored_limit", "locked"] as const;
export type PaywallReason = (typeof PAYWALL_REASONS)[number];
/** Where a pass checkout was started: a paywall (its reason) or the pricing page. */
export const CHECKOUT_SOURCES = [...PAYWALL_REASONS, "pricing"] as const;
export type CheckoutSource = (typeof CHECKOUT_SOURCES)[number];

export const EVENT_SPEC = {
  /** The pass panel was shown (reason = what the visitor was trying to do). */
  paywall_shown: { reason: PAYWALL_REASONS },
  /** "Get the 7-day pass" was clicked and a Checkout was requested. */
  pass_checkout_started: { pass: ["week"], reason: CHECKOUT_SOURCES },
  /** The visitor came back from Checkout with an active pass. */
  pass_activated: { pass: ["week"] },
} as const;

export const EVENT_NAMES: readonly string[] = [...DEFAULT_EVENT_NAMES, ...Object.keys(EVENT_SPEC)];
