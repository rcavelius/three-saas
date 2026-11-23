import type { Metadata } from "next";
import { AccountTabs } from "@/components/account/AccountNavTabs";
import { BillingActions } from "@/components/account/BillingActions";
import { formatLimit } from "@/lib/limits";
import { CATALOG } from "@/server/platform";
import { requirePageSession } from "@/server/session";

export const metadata: Metadata = { title: "Billing", robots: { index: false } };

const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(d) : null);

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : limit < 0 ? 0 : 100;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono tabular-nums">
          {used} / {formatLimit(limit)}
        </span>
      </div>
      <div className="mt-1 h-3.5 overflow-hidden rounded-full border-2 border-ink bg-surface" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit < 0 ? used : limit} aria-valuenow={used}>
        <div className={`h-full ${limit >= 0 && used > limit ? "bg-del-ink" : "bg-mint"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const { p, headers } = await requirePageSession("/account/billing");
  const { org, role } = await p.auth.requireOrg(headers);
  // The workspace's plan, raised by a one-time pass bought by the workspace or in this browser (signed cookie).
  const ent = await p.billing.getEntitlements(org.id, { passIds: p.billing.passIdsFromCookieHeader(headers.get("cookie")) });
  const workflows = await p.workflows.count(org.id);
  const { rows } = await p.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth_member WHERE organization_id = $1`, [org.id]);
  const seatsUsed = Number(rows[0]?.n ?? 1);
  const subscribed = ent.status !== "none" && ent.status !== "canceled" && ent.status !== "incomplete_expired" && ent.status !== "incomplete";
  const plans = CATALOG.plans.map((x) => ({ id: x.id, name: x.name, price: x.priceMonthlyCents / 100 }));

  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Account</p>
      <h1 className="display mt-1 text-[3rem] sm:text-[3.8rem]">Billing</h1>
      <AccountTabs current="/account/billing" />

      <div className="mt-6 grid gap-5">
        {checkout === "success" && (
          <p role="status" className="border-l-2 border-accent bg-accent-wash px-3 py-2 text-sm">
            Thanks! Your payment went through. The new plan appears here as soon as Stripe confirms it (usually within seconds; reload if needed).
          </p>
        )}
        {checkout === "canceled" && (
          <p role="status" className="border-l-2 border-rule-strong bg-sunken px-3 py-2 text-sm">
            Checkout was canceled. Nothing was charged.
          </p>
        )}
        {ent.status === "past_due" && (
          <p role="alert" className="border-l-2 border-del-ink bg-del px-3 py-2 text-sm text-del-ink">
            Your last payment failed. Update your card in &ldquo;Manage billing&rdquo;.{" "}
            {ent.graceEndsAt && ent.planId !== "free" ? `Your plan stays active until ${fmtDate(ent.graceEndsAt)}.` : "Your workspace is on the free plan until the payment succeeds."}
          </p>
        )}
        {ent.cancelAtPeriodEnd && ent.planId !== "free" && (
          <p role="status" className="border-l-2 border-rule-strong bg-sunken px-3 py-2 text-sm">
            Your {ent.planName} plan is canceled and ends on {fmtDate(ent.currentPeriodEnd) ?? "the end of the billing period"}. After that the workspace moves to Free; saved workflows above
            the free limit are kept read-only.
          </p>
        )}
        {!p.billingConfigured && (
          <p role="status" className="border-l-2 border-rule-strong bg-sunken px-3 py-2 text-sm">
            Payments are not switched on for this site yet. You can use everything on the free plan; nothing will be charged.
          </p>
        )}

        {ent.pass && (
          <p role="status" className="border-l-2 border-accent bg-accent-wash px-3 py-2 text-sm">
            {ent.pass.name.charAt(0).toUpperCase() + ent.pass.name.slice(1)} active until{" "}
            {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(ent.pass.expiresAt)} UTC. It was a one-time payment and does
            not renew. The limits below include it.
          </p>
        )}

        <section className="panel px-5 py-5">
          <h2 className="text-base font-semibold">Current plan: {ent.planName}</h2>
          <p className="mt-1 text-sm text-ink-2">
            Workspace: {org.name}
            {ent.currentPeriodEnd && ent.planId !== "free" && !ent.cancelAtPeriodEnd ? ` · renews on ${fmtDate(ent.currentPeriodEnd)}` : ""}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-3">File size</dt>
              <dd className="font-mono">{ent.limits.maxFileMb} MB</dd>
            </div>
            <div>
              <dt className="text-ink-3">Rows per file</dt>
              <dd className="font-mono">{formatLimit(ent.limits.maxRows ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Files per batch</dt>
              <dd className="font-mono">{formatLimit(ent.limits.filesPerBatch ?? 0)}</dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-3">
            <Meter label="Workflows saved in your account" used={workflows} limit={ent.limits.savedWorkflows ?? 0} />
            <Meter label="Team seats" used={seatsUsed} limit={ent.limits.teamSeats ?? 1} />
          </div>
          {(ent.limits.savedWorkflows ?? 0) >= 0 && workflows > (ent.limits.savedWorkflows ?? 0) && (
            <p className="mt-3 text-sm text-del-ink">
              {workflows - (ent.limits.savedWorkflows ?? 0)} saved workflow(s) are over this plan&rsquo;s limit. They are kept read-only (apply, export or delete) until you upgrade.
            </p>
          )}
        </section>

        <section className="panel px-5 py-5">
          <h2 className="text-base font-semibold">Change plan</h2>
          <div className="mt-3">
            <BillingActions isOwner={role === "owner"} currentPlanId={ent.subscribedPlanId} subscribed={subscribed} plans={plans} />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">
            Prices in US dollars per month. Payments are handled by Stripe. To cancel, use Manage billing; your plan runs until the end of the paid period. Refunds: contact
            support, handled by a person.
          </p>
        </section>
      </div>
    </div>
  );
}
