import type { SqlExecutor } from "@repo/database";

export type { SqlExecutor };

export const CATEGORIES = [
  "billing",
  "account",
  "bug",
  "how-to",
  "feature-request",
  "abuse",
  "security",
  "legal",
  "refund-dispute",
  "privacy",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories a person must handle: high priority, waiting_on_operator, incident + operator email. */
export const ESCALATED_CATEGORIES: readonly Category[] = ["security", "legal", "refund-dispute", "abuse", "privacy"];

export const CATEGORY_LABELS: Record<Category, string> = {
  billing: "Billing",
  account: "Account",
  bug: "Something is broken",
  "how-to": "How do I…",
  "feature-request": "Feature request",
  abuse: "Report abuse",
  security: "Security report",
  legal: "Legal",
  "refund-dispute": "Refund or payment dispute",
  privacy: "Privacy / data request",
};

export const STATUSES = ["open", "waiting_on_customer", "waiting_on_operator", "resolved", "closed"] as const;
export type TicketStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  waiting_on_customer: "Waiting for your reply",
  waiting_on_operator: "With our team",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Author = "customer" | "operator" | "assistant" | "system";

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export function isStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
