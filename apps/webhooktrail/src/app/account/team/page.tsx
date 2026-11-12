import type { Metadata } from "next";
import { AccountNav } from "@/components/account/Meter";
import { TeamManager } from "@/components/account/TeamManager";
import { orgLimits } from "@/lib/org-data";
import { requireMember } from "@/lib/server-session";
import { canManage } from "@/lib/viewer";

export const metadata: Metadata = { title: "Team", robots: { index: false, follow: false } };

export default async function TeamPage() {
  const { p, org, user } = await requireMember("/account/team");
  const lim = await orgLimits(p, org.id);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <AccountNav current="team" />
      <p className="label">{org.name}</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">Team</h1>
      <div className="mt-6 max-w-3xl">
        <TeamManager orgId={org.id} seats={lim.teamSeats} canManage={canManage(org.role)} myUserId={user.id} />
      </div>
    </div>
  );
}
