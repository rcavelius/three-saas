import type { Entitlements } from "@repo/billing";
import type { Platform } from "./platform";
import { getScan, type StoredScan } from "./scans-repo";
import { orgEntitlements, visitorAccess } from "./access";
import { gateReport, type GatedReport } from "./report-gate";

/**
 * Access rule for one report:
 *  - anonymous scans (org_id NULL): the unguessable id IS the capability;
 *  - account scans: only members of the owning org; everyone else gets "not found" (null).
 */
export async function loadViewableScan(p: Platform, headers: Headers, id: string): Promise<StoredScan | null> {
  const scan = await getScan(p.handle.executor, id, p.now());
  if (!scan) return null;
  if (scan.orgId === null) return scan;
  try {
    await p.auth.requireOrg(headers, { orgId: scan.orgId });
    return scan;
  } catch {
    return null;
  }
}

export interface ReportView extends GatedReport {
  scan: StoredScan;
  /** What the viewer is entitled to (plan of the signed-in/owning org + pass cookie). */
  ents: Entitlements;
}

/**
 * A viewable report as THIS viewer may receive it: the full report for subscribers (fullReport) and pass holders,
 * otherwise the locked copy (summary + top issues). Account reports use the owning org's plan (the viewer is a
 * member); anonymous reports use the viewer's own org plan, if signed in, and pass cookie.
 */
export async function loadReportView(p: Platform, headers: Headers, id: string): Promise<ReportView | null> {
  const scan = await loadViewableScan(p, headers, id);
  if (!scan) return null;
  const ents = scan.orgId ? await orgEntitlements(p, headers, scan.orgId) : (await visitorAccess(p, headers)).ents;
  return { scan, ents, ...gateReport(scan.report, ents) };
}
