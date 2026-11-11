import type { Metadata } from "next";
import Link from "next/link";
import { AccountNav, Meter } from "@/components/account/Meter";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { MyEndpoints } from "@/components/MyEndpoints";
import { requireMember } from "@/lib/server-session";
import { usageSummary } from "@/lib/usage";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const { p, org } = await requireMember("/app");
  const u = await usageSummary(p, org.id);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <AccountNav current="app" />
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="label">{org.name}</p>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">Endpoints</h1>
        </div>
        <div className="ml-auto">
          <CreateEndpointButton size="sm" />
        </div>
      </div>
      <section aria-label="Usage" className="mt-6 grid gap-4 md:grid-cols-2 border border-line rounded-[6px] bg-surface p-4">
        <Meter label={`Captured requests in ${u.period} (UTC)`} used={u.requestsUsed} limit={u.limits.requestsPerMonth} />
        <Meter label="Active endpoints" used={u.activeEndpoints} limit={u.limits.endpoints} />
        <p className="md:col-span-2 text-[12.5px] text-fg-dim">
          {u.limits.planName} plan · history {u.limits.historyDays} day{u.limits.historyDays === 1 ? "" : "s"} · newest{" "}
          {u.limits.requestsStored.toLocaleString("en-US")} requests per endpoint ·{" "}
          {u.limits.endpointTtlHours === null ? "endpoints never expire" : `endpoints expire after ${u.limits.endpointTtlHours} h`}
          {u.lockedEndpoints > 0 && (
            <span className="text-err">
              {" "}
              · {u.lockedEndpoints} endpoint{u.lockedEndpoints === 1 ? " is" : "s are"} paused by the plan limit
            </span>
          )}{" "}
          · <Link className="text-signal underline underline-offset-2" href="/account/billing">Billing</Link>
        </p>
      </section>
      <div className="mt-8">
        <MyEndpoints />
      </div>
    </div>
  );
}
