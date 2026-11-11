/**
 * Plan limits live here and nowhere else. The free tier is enforced in the browser UI; paid tiers
 * are listed for the pricing page and are not purchasable yet (accounts are not built).
 */
export interface PlanLimits {
  maxFileBytes: number;
  maxRows: number;
  maxFiles: number;
}

export const FREE_LIMITS: PlanLimits = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 50_000,
  maxFiles: 3,
};

export interface Plan {
  id: "free" | "pro" | "business";
  name: string;
  priceMonthly: number;
  limits: PlanLimits;
  blurb: string;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    limits: FREE_LIMITS,
    blurb: "Everything in the cleaner, in your browser, no account.",
    features: [
      "All cleaning steps",
      "CSV and XLSX in and out",
      "Merge and batch up to 3 files",
      "Workflows saved in this browser, export as JSON",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 12,
    limits: { maxFileBytes: 50 * 1024 * 1024, maxRows: 500_000, maxFiles: 20 },
    blurb: "Bigger files and workflows that follow you between devices.",
    features: ["Everything in Free", "Workflows synced to your account", "Larger batches"],
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 29,
    limits: { maxFileBytes: 200 * 1024 * 1024, maxRows: 2_000_000, maxFiles: 100 },
    blurb: "For teams that clean the same exports every week.",
    features: ["Everything in Pro", "Shared team workflows", "Priority email support"],
  },
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
