/**
 * Limits applied to LOCAL processing in the browser.
 *
 * Honest framing: files are read and cleaned on the user's own device and never reach our servers,
 * so these limits are value fences for the plans, not security boundaries — a determined user can
 * change their own browser. There is no server-side resource behind them to protect. What the server
 * does enforce is everything it actually serves: saved-workflow counts and team seats.
 *
 * The plan numbers come from the server (`/api/me/entitlements`, computed from
 * billing.getEntitlements and the shared DATAPOLISH_CATALOG); nothing here hardcodes plan values.
 * ABSOLUTE_LIMITS are this app's own safety caps for the browser tab, applied on every plan.
 */

/** Shape of GET /api/me/entitlements. */
export interface ClientEntitlements {
  signedIn: boolean;
  planId: string;
  planName: string;
  status: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  subscribedPlanId?: string;
  org: { id: string; name: string; role: "owner" | "admin" | "member" } | null;
  user?: { id: string; email: string; name: string };
  usage: { savedWorkflows: number; teamSeats: number } | null;
  billingConfigured: boolean;
}

export interface ProcessingLimits {
  planId: string;
  planName: string;
  maxFileBytes: number;
  maxRows: number;
  maxFiles: number;
}

const MB = 1024 * 1024;

/**
 * Hard caps for one browser tab, even on the Business plan: beyond these a tab is likely to run out
 * of memory regardless of the device, so the app refuses with a clear message instead of crashing.
 */
export const ABSOLUTE_LIMITS = {
  /** One file. */
  fileBytes: 256 * MB,
  /** All files loaded at once. */
  totalBytes: 512 * MB,
  rows: 2_000_000,
  /** rows × columns of one parsed file. */
  cells: 40_000_000,
  /** rows × columns of all loaded files together. */
  totalCells: 60_000_000,
  files: 100,
} as const;

const cap = (planValue: number | undefined, absolute: number) => (planValue === undefined || planValue < 0 ? absolute : Math.min(planValue, absolute));

/** Converts plan limits (catalog units: MB, rows, files) to what the cleaner applies. */
export function processingLimits(planId: string, planName: string, limits: Record<string, number>): ProcessingLimits {
  return {
    planId,
    planName,
    maxFileBytes: cap(limits.maxFileMb === undefined ? undefined : limits.maxFileMb < 0 ? -1 : limits.maxFileMb * MB, ABSOLUTE_LIMITS.fileBytes),
    maxRows: cap(limits.maxRows, ABSOLUTE_LIMITS.rows),
    maxFiles: cap(limits.filesPerBatch, ABSOLUTE_LIMITS.files),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatLimit(n: number): string {
  return n < 0 ? "Unlimited" : n.toLocaleString("en-US");
}
