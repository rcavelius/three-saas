import { orgLimits } from "./org-data";
import type { PlanLimits } from "./plans";
import type { Platform } from "./platform";

export interface UsageSummary {
  limits: PlanLimits;
  period: string;
  requestsUsed: number;
  activeEndpoints: number;
  lockedEndpoints: number;
  members: number;
}

/** Usage meters for the dashboard / billing page (server-side only). */
export async function usageSummary(p: Platform, orgId: string): Promise<UsageSummary> {
  const limits = await orgLimits(p, orgId);
  const period = p.billing.currentPeriod();
  const requestsUsed = await p.billing.getUsage(orgId, "requestsPerMonth", { period });
  const { rows } = await p.ex.query<{ active: number; locked: number; members: number }>(
    `SELECT
       (SELECT count(*)::int FROM endpoints WHERE org_id = $1 AND deleted_at IS NULL AND locked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active,
       (SELECT count(*)::int FROM endpoints WHERE org_id = $1 AND deleted_at IS NULL AND locked_at IS NOT NULL) AS locked,
       (SELECT count(*)::int FROM auth_member WHERE organization_id = $1) AS members`,
    [orgId],
  );
  return {
    limits,
    period,
    requestsUsed,
    activeEndpoints: Number(rows[0]?.active ?? 0),
    lockedEndpoints: Number(rows[0]?.locked ?? 0),
    members: Number(rows[0]?.members ?? 0),
  };
}
