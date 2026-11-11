/**
 * Plan presentation for the pricing page and JSON-LD, derived from DATAPOLISH_CATALOG (@repo/billing)
 * so prices and limits are never typed twice. Server-only (keeps the billing package out of client bundles).
 */
import { DATAPOLISH_CATALOG, getFreePlan, type PlanDef } from "@repo/billing";
import { processingLimits, type ProcessingLimits } from "@/lib/limits";

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
  return DATAPOLISH_CATALOG.plans.map((p) => ({
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
  const free = getFreePlan(DATAPOLISH_CATALOG);
  return processingLimits(free.id, free.name, free.limits);
}

export function softwareApplicationLd(url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "DataPolish",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    url,
    description: "Clean CSV and Excel files in your browser: trim spaces, remove duplicates, fix dates and numbers, merge files. Files are never uploaded.",
    offers: DATAPOLISH_CATALOG.plans.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: (p.priceMonthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      ...(p.priceMonthlyCents > 0 ? { priceSpecification: { "@type": "UnitPriceSpecification", price: (p.priceMonthlyCents / 100).toFixed(2), priceCurrency: "USD", unitCode: "MON" } } : {}),
    })),
  };
}
