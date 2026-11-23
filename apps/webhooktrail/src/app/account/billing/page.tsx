import type { Metadata } from "next";
import { BillingActions } from "./actions";
import { AccountNav, Meter } from "@/components/account/Meter";
import { linkedPassIds } from "@/lib/pass";
import { requireMember } from "@/lib/server-session";
import { usageSummary } from "@/lib/usage";

export const metadata: Metadata = { title: "Billing", robots: { index: false, follow: false } };

const dateFmt = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(d);

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { p, org, viewer } = await requireMember("/account/billing");
  const sp = await searchParams;
  // Plan + passes bought by the workspace + this browser's pass cookie + passes linked to the workspace.
  const ent = await p.billing.getEntitlements(org.id, { passIds: [...viewer.passIds, ...(await linkedPassIds(p.ex, { orgId: org.id }))] });
  const u = await usageSummary(p, org.id);
  const isOwner = org.role === "owner";
  const paid = ent.planId !== p.billing.catalog.freePlanId;
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <AccountNav current="billing" />
      <p className="label">{org.name}</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">Billing</h1>

      {sp.checkout === "success" && (
        <p role="status" className="mt-4 border border-ok/40 bg-ok/5 rounded-[4px] px-3 py-2 text-[13px] text-ok">
          Thanks! Your payment went through. The new plan applies as soon as Stripe confirms it (usually within seconds; refresh if it has not
          changed yet).
        </p>
      )}
      {sp.checkout === "canceled" && (
        <p role="status" className="mt-4 border border-line rounded-[4px] px-3 py-2 text-[13px] text-fg-muted">
          Checkout canceled. Nothing was charged.
        </p>
      )}
      {!p.billingConfigured && (
        <p role="status" className="mt-4 border border-warn/40 bg-warn/5 rounded-[4px] px-3 py-2 text-[13px] text-warn">
          Billing is not configured on this server yet, so upgrades are unavailable. Everything on the Free plan works.
        </p>
      )}
      {ent.status === "past_due" && (
        <p role="alert" className="mt-4 border border-err/40 bg-err/5 rounded-[4px] px-3 py-2 text-[13px] text-err">
          Your last payment failed. Update your card in the billing portal
          {ent.graceEndsAt ? ` before ${dateFmt(ent.graceEndsAt)} (UTC) to keep the ${ent.planName} plan` : ""}; after that the workspace moves to
          Free and endpoints over the Free limit are paused (not deleted).
        </p>
      )}
      {ent.cancelAtPeriodEnd && ent.currentPeriodEnd && (
        <p role="status" className="mt-4 border border-warn/40 bg-warn/5 rounded-[4px] px-3 py-2 text-[13px] text-warn">
          Your subscription is canceled and ends on {dateFmt(ent.currentPeriodEnd)} (UTC). Until then you keep {ent.planName}. Afterwards
          endpoints over the Free limit are paused, not deleted.
        </p>
      )}

      {ent.pass && (
        <p role="status" className="mt-4 border border-ok/40 bg-ok/5 rounded-[4px] px-3 py-2 text-[13px] text-ok">
          {ent.pass.name} active until {dateFmt(ent.pass.expiresAt)} (UTC). It is a one-time payment and does not renew.
        </p>
      )}

      <section aria-labelledby="b-current" className="mt-6 border border-line rounded-[6px] bg-surface p-5 grid gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="b-current" className="text-[18px] font-semibold">
            {ent.planName} plan
          </h2>
          <span className="font-mono text-[12px] text-fg-dim">
            status: {ent.status === "none" ? "free" : ent.status}
            {ent.currentPeriodEnd && !ent.cancelAtPeriodEnd && paid ? ` · renews ${dateFmt(ent.currentPeriodEnd)}` : ""}
          </span>
        </div>
        <Meter label={`Captured requests in ${u.period} (UTC)`} used={u.requestsUsed} limit={u.limits.requestsPerMonth} />
        <Meter label="Active endpoints" used={u.activeEndpoints} limit={u.limits.endpoints} />
        <Meter label="Seats" used={u.members} limit={u.limits.teamSeats} />
        {u.lockedEndpoints > 0 && (
          <p className="text-[13px] text-err">
            {u.lockedEndpoints} endpoint{u.lockedEndpoints === 1 ? " is" : "s are"} paused because the plan covers fewer endpoints. Their data is
            kept; they resume after an upgrade.
          </p>
        )}
      </section>

      <BillingActions
        isOwner={isOwner}
        paid={paid}
        currentPlanId={ent.planId}
        plans={p.billing.catalog.plans.map((pl) => ({ id: pl.id, name: pl.name, priceMonthlyCents: pl.priceMonthlyCents }))}
        freePlanId={p.billing.catalog.freePlanId}
      />
    </div>
  );
}
