/**
 * The one-time "Full-site report" pass as plain, serialisable props for client components (numbers from the
 * billing catalog, the single source of truth). Server-only import: client components receive the result as props.
 */
import { CHANGEKITE_CATALOG, getPass, getPlan } from "@repo/billing";

export interface ReportOffer {
  passId: string;
  name: string;
  /** "$9" */
  price: string;
  /** "7 days" */
  duration: string;
  pagesPerScan: number;
  /** Free-tier issues per report. */
  freeIssues: number;
  freePages: number;
  /** "$19" */
  soloPrice: string;
  pdf: boolean;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export function durationLabel(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24;
    return d === 1 ? "24 hours" : `${d} days`;
  }
  return `${hours} hours`;
}

export function reportOffer(): ReportOffer {
  const pass = getPass(CHANGEKITE_CATALOG, "report");
  const free = getPlan(CHANGEKITE_CATALOG, CHANGEKITE_CATALOG.freePlanId)!;
  const solo = getPlan(CHANGEKITE_CATALOG, "solo")!;
  if (!pass) throw new Error("ChangeKite catalog has no report pass");
  return {
    passId: pass.id,
    name: pass.name,
    price: dollars(pass.priceCents),
    duration: durationLabel(pass.durationHours),
    pagesPerScan: pass.limits.pagesPerScan ?? free.limits.pagesPerScan ?? 25,
    freeIssues: free.limits.reportIssues ?? 3,
    freePages: free.limits.pagesPerScan ?? 25,
    soloPrice: dollars(solo.priceMonthlyCents),
    pdf: pass.features.pdfReports === true,
  };
}
