import type { Metadata } from "next";
import { CHANGEKITE_CATALOG } from "@repo/billing";
import { AccountNav } from "@/components/account/AccountNav";
import { PlanActions } from "@/components/account/PlanActions";
import { Notice, PageTitle, fmtDate } from "@/components/ui";
import { countActiveSites } from "@/lib/monitoring/sites";
import { safePlan } from "@/lib/safe-next";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Plan & billing", robots: { index: false } };

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : used > 0 ? 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="num text-muted">
          {used} / {limit === -1 ? "unlimited" : limit}
        </span>
      </div>
      <div
        className="mt-1 h-2 bg-paper-deep"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit === -1 ? used : limit}
        aria-valuenow={used}
      >
        <div className={`h-2 ${pct >= 100 ? "bg-fail" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const v = await requireViewer("/account/billing");
  const e = v.ents;
  const ex = v.p.handle.executor;
  const sites = await countActiveSites(ex, v.org.id);
  const { rows: m } = await ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth_member WHERE organization_id = $1`, [v.org.id]);
  const { rows: locked } = await ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM sites WHERE org_id = $1 AND plan_locked`, [v.org.id]);
  const subscribed = ["active", "trialing", "past_due", "unpaid", "paused"].includes(e.status);
  const checkout = typeof sp.checkout === "string" ? sp.checkout : null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
      <PageTitle eyebrow={v.org.name} title="Plan & billing" />
      <AccountNav current="/account/billing" />
      <div className="mt-8 space-y-8">
        {checkout === "success" && (
          <Notice tone="ok" role="status">
            Thank you. Your payment went through; the new plan appears here as soon as Stripe confirms it (usually within seconds; reload if needed).
          </Notice>
        )}
        {checkout === "canceled" && <Notice tone="info">Checkout was cancelled. Nothing was charged.</Notice>}
        {!v.p.billingEnabled && (
          <Notice tone="warn">Online payments are not switched on yet on this server. You can use every free feature; nothing can be charged.</Notice>
        )}
        {e.status === "past_due" && (
          <Notice tone="error" role="alert">
            Your last payment failed. Update your payment method to keep the {CHANGEKITE_CATALOG.plans.find((p) => p.id === e.subscribedPlanId)?.name} plan
            {e.graceEndsAt ? ` — it stays active until ${fmtDate(e.graceEndsAt.toISOString())}` : ""}.
          </Notice>
        )}
        {e.cancelAtPeriodEnd && e.currentPeriodEnd && (
          <Notice tone="warn">
            Your subscription is cancelled and ends on {fmtDate(e.currentPeriodEnd.toISOString())}. After that the workspace moves to the free plan: monitored
            sites are paused (not deleted).
          </Notice>
        )}
        {locked[0]!.n > 0 && (
          <Notice tone="warn">
            {locked[0]!.n} monitored site{locked[0]!.n === 1 ? " is" : "s are"} paused because the current plan allows fewer sites. Nothing was deleted; upgrade or
            remove other sites to resume {locked[0]!.n === 1 ? "it" : "them"}.
          </Notice>
        )}

        <section aria-labelledby="current" className="card !rounded-[20px] p-6">
          <h2 id="current" className="eyebrow">
            Current plan
          </h2>
          <p className="mt-2 font-display text-3xl font-semibold">{e.planName}</p>
          <p className="mt-1 text-sm text-muted">
            Status: {e.status === "none" ? "free plan" : e.status.replace("_", " ")}
            {e.currentPeriodEnd && !e.cancelAtPeriodEnd && subscribed ? ` · renews ${fmtDate(e.currentPeriodEnd.toISOString())}` : ""}
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Meter label="Monitored sites" used={sites} limit={e.limits.sites ?? 0} />
            <Meter label="Team seats" used={Number(m[0]!.n)} limit={e.limits.teamSeats ?? 1} />
          </div>
          <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between border-b border-rule py-1"><dt>Pages per scan</dt><dd className="num">{e.limits.pagesPerScan}</dd></div>
            <div className="flex justify-between border-b border-rule py-1"><dt>Scan frequency</dt><dd className="num">{e.limits.scanFrequencyHours ? `every ${e.limits.scanFrequencyHours} h` : "on demand only"}</dd></div>
            <div className="flex justify-between border-b border-rule py-1"><dt>Report history</dt><dd className="num">{e.limits.historyDays ? `${e.limits.historyDays} days` : "none"}</dd></div>
            <div className="flex justify-between border-b border-rule py-1"><dt>PDF reports</dt><dd>{e.features.pdfReports ? "included" : "browser print"}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="change">
          <h2 id="change" className="font-display text-2xl font-semibold">
            {subscribed ? "Change or cancel" : "Upgrade"}
          </h2>
          <div className="mt-4">
            <PlanActions
              plans={CHANGEKITE_CATALOG.plans.map((p) => ({ id: p.id, name: p.name, priceMonthlyCents: p.priceMonthlyCents }))}
              currentPlanId={e.planId}
              subscribed={subscribed}
              isOwner={v.role === "owner"}
              autoCheckoutPlan={v.p.billingEnabled ? safePlan(sp.plan) : null}
            />
          </div>
          {safePlan(sp.plan) && !v.p.billingEnabled && (
            <p className="mt-3 text-sm text-muted">You picked a paid plan; checkout will be available once payments are switched on.</p>
          )}
        </section>
        <p className="text-sm text-muted">
          Charged in error, or ChangeKite did not work for you in your first 14 days? Contact support within 14 days of the charge for a full refund. Other billing questions are handled by a person. Prices in US dollars; taxes may apply where required.
        </p>
      </div>
    </div>
  );
}
