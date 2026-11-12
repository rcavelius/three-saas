/**
 * Operator details for the legal pages, from the environment (Worker vars), so the owner can publish the
 * final policies without a code change:
 *   LEGAL_ENTITY        e.g. "Example LLC"                  (required for publication)
 *   LEGAL_ADDRESS       registered business address         (required for publication)
 *   LEGAL_JURISDICTION  governing law, e.g. "the State of Delaware, USA" (required for publication)
 *   LEGAL_EFFECTIVE     date the approved version takes effect, e.g. "2026-11-20"
 *   LEGAL_APPROVED=1    set only after the owner (and counsel) approved the text
 * Until every required value is present AND LEGAL_APPROVED=1, the pages stay marked as drafts and noindex.
 */
export interface LegalInfo {
  entity: string | null;
  address: string | null;
  jurisdiction: string | null;
  effective: string | null;
  supportEmail: string;
  abuseEmail: string;
  published: boolean;
}

export function legalInfo(env: Record<string, string | undefined> = process.env): LegalInfo {
  const v = (k: string) => env[k]?.trim() || null;
  const entity = v("LEGAL_ENTITY");
  const address = v("LEGAL_ADDRESS");
  const jurisdiction = v("LEGAL_JURISDICTION");
  return {
    entity,
    address,
    jurisdiction,
    effective: v("LEGAL_EFFECTIVE"),
    supportEmail: v("SUPPORT_EMAIL") ?? "support@gridrinse.com",
    abuseEmail: v("ABUSE_EMAIL") ?? "abuse@gridrinse.com",
    published: Boolean(entity && address && jurisdiction && env.LEGAL_APPROVED === "1"),
  };
}
