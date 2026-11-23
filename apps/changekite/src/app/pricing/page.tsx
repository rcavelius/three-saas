import type { Metadata } from "next";
import Link from "next/link";
import { paidPlans, CHANGEKITE_CATALOG } from "@repo/billing";
import { JsonLd } from "@/components/JsonLd";
import { PricingButton } from "@/components/PricingButton";
import { PassBuyButton } from "@/components/PassBuyButton";
import { PassReturnNotice, type PassReturnStatus } from "@/components/PassNotices";
import { PRICING_FAQ, REPORT_PASS, faqJsonLd, passDuration, passFeatures, passPrice, planFeatures, price, softwareApplicationJsonLd } from "@/lib/marketing";
import { visitorAccess } from "@/lib/access";
import { getPlatform } from "@/lib/platform";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { getViewer } from "@/lib/viewer";

const paidSummary = paidPlans(CHANGEKITE_CATALOG)
  .map((p) => `${price(p)}/month (${p.name}, ${p.limits.sites} sites)`)
  .join(" or ");

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free website scan with a summary and the top issues. Full report ${passPrice(REPORT_PASS)} one-time. Monitoring with scheduled re-scans and email alerts from ${paidSummary}.`,
  alternates: { canonical: "/pricing" },
  openGraph: { title: "ChangeKite pricing", description: `Free scan summary; full report ${passPrice(REPORT_PASS)} one-time; monitoring from ${paidSummary}.` },
};

const RETURN_STATUSES: readonly PassReturnStatus[] = ["active", "unpaid", "expired", "revoked", "invalid", "error", "canceled"];

export default async function PricingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  const access = await visitorAccess(await getPlatform(), await headers());
  const activePass = access.ents.pass;
  const sp = await searchParams;
  const passStatus = typeof sp.pass === "string" && (RETURN_STATUSES as readonly string[]).includes(sp.pass) ? (sp.pass as PassReturnStatus) : null;
  const appUrl = new URL(env().APP_URL).origin;
  const current = viewer?.ents.planId ?? null;
  const subscribed = viewer ? ["active", "trialing", "past_due", "unpaid", "paused"].includes(viewer.ents.status) : false;
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <JsonLd data={softwareApplicationJsonLd(appUrl)} />
      <JsonLd data={faqJsonLd(PRICING_FAQ)} />
      {passStatus && <PassReturnNotice status={passStatus} expiresAt={activePass ? activePass.expiresAt.toISOString() : null} context="page" />}
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Free to inspect. Pay once for the full report, or monthly to have it watched.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        A free scan needs no account and shows the score, a summary of every check and the most severe issues. The {REPORT_PASS.name} pass
        unlocks every issue with its fix for {passDuration(REPORT_PASS)}, paid once. The monthly plans re-scan the sites you look after on a schedule and
        email you when something meaningful changes.
      </p>

      <div className="mt-12 grid gap-px border border-ink bg-rule md:grid-cols-2 xl:grid-cols-4">
        {CHANGEKITE_CATALOG.plans.map((p) => {
          const free = p.id === CHANGEKITE_CATALOG.freePlanId;
          const card = (
            <section key={p.id} aria-labelledby={`plan-${p.id}`} className="flex flex-col bg-paper p-6 sm:p-8">
              <h2 id={`plan-${p.id}`} className="font-display text-2xl font-semibold">
                {p.name}
              </h2>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="num text-4xl">{price(p)}</span>
                <span className="text-muted">{free ? "" : "/month"}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-[0.95rem] text-ink-soft">
                {planFeatures(p).map((f) => (
                  <li key={f} className="border-l border-rule pl-3">
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {free ? (
                  <Link href="/" className="inline-flex min-h-11 items-center border border-ink px-5 font-medium text-ink hover:bg-paper-deep">
                    Run a free scan
                  </Link>
                ) : (
                  <PricingButton
                    planId={p.id}
                    label={current === p.id ? "Your current plan" : `Choose ${p.name}`}
                    mode={!viewer ? "signup" : subscribed ? "manage" : viewer.role === "owner" ? "checkout" : "owner-only"}
                    disabled={current === p.id}
                  />
                )}
              </div>
            </section>
          );
          if (!free) return card;
          // The one-time pass sits right after Free: the step between the free summary and a subscription.
          return [
            card,
            <section key="pass" aria-labelledby="plan-pass" className="flex flex-col bg-sheet p-6 sm:p-8">
              <h2 id="plan-pass" className="font-display text-2xl font-semibold">
                {REPORT_PASS.name}
              </h2>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="num text-4xl">{passPrice(REPORT_PASS)}</span>
                <span className="text-muted">once</span>
              </p>
              <p className="mt-2 text-sm font-medium text-ink">One-time, no subscription, no account needed.</p>
              <ul className="mt-6 flex-1 space-y-2 text-[0.95rem] text-ink-soft">
                {passFeatures(REPORT_PASS).map((f) => (
                  <li key={f} className="border-l border-rule pl-3">
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {activePass ? (
                  <p className="text-sm text-ink-soft">
                    Your pass is active until{" "}
                    <span className="num">
                      {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(activePass.expiresAt)} UTC
                    </span>
                    .
                  </p>
                ) : (
                  <PassBuyButton
                    passId={REPORT_PASS.id}
                    returnPath="/pricing"
                    from="pricing"
                    label={`Get the full report — ${passPrice(REPORT_PASS)}`}
                    className="inline-flex min-h-11 items-center bg-accent px-5 font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                  />
                )}
              </div>
            </section>,
          ];
        })}
      </div>
      <p className="mt-6 text-sm text-muted">
        Prices in US dollars. Plans are billed monthly and can be cancelled any time; the pass is charged once and never renews. Taxes may apply where
        required.
      </p>

      <section aria-labelledby="faq" className="mt-20 max-w-3xl">
        <h2 id="faq" className="font-display text-3xl font-semibold">
          Questions
        </h2>
        <dl className="mt-6 divide-y divide-rule border-y border-rule">
          {PRICING_FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-2 leading-relaxed text-ink-soft">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
