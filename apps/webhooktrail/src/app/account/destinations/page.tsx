import type { Metadata } from "next";
import { DestinationsManager } from "@/components/account/DestinationsManager";
import { AccountNav } from "@/components/account/Meter";
import { orgLimits } from "@/lib/org-data";
import { requireMember } from "@/lib/server-session";
import { canManage } from "@/lib/viewer";

export const metadata: Metadata = { title: "Replay destinations", robots: { index: false, follow: false } };

export default async function DestinationsPage() {
  const { p, org } = await requireMember("/account/destinations");
  const lim = await orgLimits(p, org.id);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <AccountNav current="destinations" />
      <p className="label">{org.name}</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">Replay destinations</h1>
      <div className="mt-6 max-w-3xl">
        <DestinationsManager canManage={canManage(org.role)} replayEnabled={lim.replay} />
      </div>
    </div>
  );
}
