/**
 * Plan presentation for the pricing page and JSON-LD, derived from GRIDRINSE_CATALOG (@repo/billing)
 * so prices and limits are never typed twice. Server-only (keeps the billing package out of client bundles).
 */
import { applyPassGrants, GRIDRINSE_CATALOG, getFreePlan, getPass, type PlanDef } from "@repo/billing";
import { processingLimits, type PassOffer, type ProcessingLimits, type UpgradeOffer } from "@/lib/limits";

export interface DisplayPlan {
  id: string;
  name: string;
  priceMonthly: number;
  limits: PlanDef["limits"];
  features: PlanDef["features"];
  blurb: string;
  highlights: string[];
}

const BLURB: Record<string, string> = {
  free: "Everything in the cleaner, in your browser, no account needed.",
  pro: "Bigger files, bigger batches and workflows saved to your account.",
  business: "For teams that clean the same exports every week.",
};

function highlights(p: PlanDef): string[] {
  const out = ["All cleaning steps", "CSV and XLSX in and out, ZIP for batches"];
  if (p.features.cloudWorkflows) out.push(p.limits.savedWorkflows! < 0 ? "Unlimited workflows in your account" : `${p.limits.savedWorkflows} workflows in your account`);
  else out.push("Workflows saved in this browser, export as JSON");
  if (p.features.sharedTeamWorkflows) out.push(`Shared team workflows, ${p.limits.teamSeats} seats`);
  if (p.features.prioritySupport) out.push("Priority email support");
  return out;
}

export function displayPlans(): DisplayPlan[] {
  return GRIDRINSE_CATALOG.plans.map((p) => ({
    id: p.id,
    name: p.name,
    priceMonthly: p.priceMonthlyCents / 100,
    limits: p.limits,
    features: p.features,
    blurb: BLURB[p.id] ?? "",
    highlights: highlights(p),
  }));
}

export function freeProcessingLimits(): ProcessingLimits {
  const free = getFreePlan(GRIDRINSE_CATALOG);
  return processingLimits(free.id, free.name, free.limits);
}

/**
 * What each paid plan really adds to the cleaner, straight from the catalog, for the upgrade prompts
 * (file size, rows, files at once, saved workflows). Prompts may only claim these numbers.
 */
export function upgradeOffers(): UpgradeOffer[] {
  return GRIDRINSE_CATALOG.plans
    .filter((p) => p.priceMonthlyCents > 0)
    .map((p) => {
      const l = processingLimits(p.id, p.name, p.limits);
      return {
        planId: p.id,
        planName: p.name,
        priceMonthly: p.priceMonthlyCents / 100,
        maxFileBytes: l.maxFileBytes,
        maxRows: l.maxRows,
        maxFiles: l.maxFiles,
        savedWorkflows: p.limits.savedWorkflows ?? 0,
      };
    });
}

/** The one-time pass the paywall offers ("day": 24 hours of Pro processing limits and unlimited downloads), from the catalog. */
export function passOffer(passId = "day"): PassOffer | null {
  const def = getPass(GRIDRINSE_CATALOG, passId);
  if (!def) return null;
  const free = getFreePlan(GRIDRINSE_CATALOG);
  // A pass raises limits on top of the plan (larger wins), exactly as billing.getEntitlements applies it.
  const merged = applyPassGrants(free.limits, free.features, [def]).limits;
  const l = processingLimits(free.id, def.name, merged);
  return { passId: def.id, name: def.name, price: def.priceCents / 100, durationHours: def.durationHours, maxFileBytes: l.maxFileBytes, maxRows: l.maxRows, maxFiles: l.maxFiles };
}

export function softwareApplicationLd(url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GridRinse",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url,
    description: "Clean CSV and Excel files in your browser: trim spaces, remove duplicates, fix dates and numbers, merge files. Files are never uploaded.",
    offers: [
      ...GRIDRINSE_CATALOG.plans.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: (p.priceMonthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      ...(p.priceMonthlyCents > 0 ? { priceSpecification: { "@type": "UnitPriceSpecification", price: (p.priceMonthlyCents / 100).toFixed(2), priceCurrency: "USD", unitCode: "MON" } } : {}),
      })),
      // One-time passes: a single payment, no subscription.
      ...(GRIDRINSE_CATALOG.passes ?? []).map((x) => ({
        "@type": "Offer",
        name: x.name,
        price: (x.priceCents / 100).toFixed(2),
        priceCurrency: "USD",
        description: `One-time payment, no subscription: Pro file limits and unlimited downloads for ${x.durationHours} hours.`,
      })),
    ],
  };
}
