import type { Metadata } from "next";
import { AccountTabs } from "@/components/account/AccountNavTabs";
import { TeamPanel } from "@/components/account/TeamPanel";
import { requirePageSession } from "@/server/session";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function TeamPage() {
  const { p, headers } = await requirePageSession("/account/team");
  const { org, role, user } = await p.auth.requireOrg(headers);
  const ent = await p.billing.getEntitlements(org.id);
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Account</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Team</h1>
      <AccountTabs current="/account/team" />
      <TeamPanel orgId={org.id} orgName={org.name} myRole={role} myUserId={user.id} seats={ent.limits.teamSeats ?? 1} planName={ent.planName} />
    </div>
  );
}
