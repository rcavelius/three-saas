/**
 * Limits applied to LOCAL processing in the browser.
 *
 * Honest framing: files are read and cleaned on the user's own device and never reach our servers,
 * so these limits are value fences for the plans, not security boundaries — a determined user can
 * change their own browser. There is no server-side resource behind them to protect. What the server
 * does enforce is everything it actually serves: saved-workflow counts and team seats.
 *
 * The plan numbers come from the server (`/api/me/entitlements`, computed from
 * billing.getEntitlements and the shared GRIDRINSE_CATALOG); nothing here hardcodes plan values.
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
  /**
   * The visitor's active one-time pass (from the pass cookie, or bought by the signed-in workspace), or null.
   * unlockUrl is the buyer's reusable link that unlocks the pass in another browser.
   */
  pass?: { name: string; expiresAt: string; unlockUrl: string } | null;
}

export interface ProcessingLimits {
  planId: string;
  planName: string;
  maxFileBytes: number;
  maxRows: number;
  maxFiles: number;
  /** Most rows in one cleaned download; -1 = unlimited. */
  downloadRows: number;
  /** Cleaned downloads per UTC day in this browser; -1 = unlimited. */
  downloadsPerDay: number;
}

/** A one-time pass as the paywall may describe it (server-computed from the catalog). */
export interface PassOffer {
  passId: string;
  name: string;
  /** US dollars, charged once. */
  price: number;
  durationHours: number;
  maxFileBytes: number;
  maxRows: number;
  maxFiles: number;
}

/** True when the pass would really take a file/batch of this size (the pass is only offered when it would). */
export function passFits(pass: PassOffer | null | undefined, need?: { fileBytes?: number; rows?: number; files?: number }): pass is PassOffer {
  if (!pass) return false;
  return (need?.fileBytes === undefined || pass.maxFileBytes >= need.fileBytes) && (need?.rows === undefined || pass.maxRows >= need.rows) && (need?.files === undefined || pass.maxFiles >= need.files);
}

/** A paid plan as the upgrade prompts may describe it (server-computed from the catalog). */
export interface UpgradeOffer {
  planId: string;
  planName: string;
  priceMonthly: number;
  maxFileBytes: number;
  maxRows: number;
  maxFiles: number;
  /** -1 = unlimited, 0 = none in the account. */
  savedWorkflows: number;
}

/** The cheapest paid plan that beats the current one on `need` (or any paid plan above it when no need is given). */
export function nextOffer(offers: UpgradeOffer[], current: ProcessingLimits, need?: { fileBytes?: number; rows?: number; files?: number }): UpgradeOffer | null {
  const above = offers.filter((o) => o.planId !== current.planId && o.maxFileBytes >= current.maxFileBytes && o.maxFiles >= current.maxFiles && (o.maxFileBytes > current.maxFileBytes || o.maxFiles > current.maxFiles || o.maxRows > current.maxRows));
  const fits = above.filter((o) => (need?.fileBytes === undefined || o.maxFileBytes >= need.fileBytes) && (need?.rows === undefined || o.maxRows >= need.rows) && (need?.files === undefined || o.maxFiles >= need.files));
  // A plan that would still refuse this file is never offered.
  const sorted = (need ? fits : above).sort((a, b) => a.priceMonthly - b.priceMonthly);
  return sorted[0] ?? null;
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
    downloadRows: limits.downloadRows === undefined || limits.downloadRows < 0 ? -1 : limits.downloadRows,
    downloadsPerDay: limits.downloadsPerDay === undefined || limits.downloadsPerDay < 0 ? -1 : limits.downloadsPerDay,
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
