import type { Platform } from "./platform";
import { getScan, type StoredScan } from "./scans-repo";

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
