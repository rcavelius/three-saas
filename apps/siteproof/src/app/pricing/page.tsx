import type { Metadata } from "next";
import Link from "next/link";
import { paidPlans, SITEPROOF_CATALOG } from "@repo/billing";
import { JsonLd } from "@/components/JsonLd";
import { PricingButton } from "@/components/PricingButton";
import { PRICING_FAQ, faqJsonLd, planFeatures, price, softwareApplicationJsonLd } from "@/lib/marketing";
import { env } from "@/lib/env";
import { getViewer } from "@/lib/viewer";

const paidSummary = paidPlans(SITEPROOF_CATALOG)
  .map((p) => `${price(p)}/month (${p.name}, ${p.limits.sites} sites)`)
  .join(" or ");

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free one-off website scans. Monitoring with scheduled re-scans and email alerts from ${paidSummary}.`,
  alternates: { canonical: "/pricing" },
  openGraph: { title: "SiteProof pricing", description: `Free scans; monitoring from ${paidSummary}.` },
};

export default async function PricingPage() {
  const viewer = await getViewer();
  const appUrl = new URL(env().APP_URL).origin;
  const current = viewer?.ents.planId ?? null;
  const subscribed = viewer ? ["active", "trialing", "past_due", "unpaid", "paused"].includes(viewer.ents.status) : false;
  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <JsonLd data={softwareApplicationJsonLd(appUrl)} />
      <JsonLd data={faqJsonLd(PRICING_FAQ)} />
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Free to inspect. Pay when you want it watched.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        One-off scans are free and need no account. The paid plans re-scan the sites you look after on a schedule and email you when something
        meaningful changes.
      </p>

      <div className="mt-12 grid border border-ink md:grid-cols-3">
        {SITEPROOF_CATALOG.plans.map((p) => {
          const free = p.id === SITEPROOF_CATALOG.freePlanId;
          return (
            <section
              key={p.id}
              aria-labelledby={`plan-${p.id}`}
              className="flex flex-col border-b border-rule p-6 last:border-b-0 md:border-b-0 md:border-l md:first:border-l-0 sm:p-8"
            >
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
        })}
      </div>
      <p className="mt-6 text-sm text-muted">Prices in US dollars, billed monthly. Taxes may apply where required. Cancel any time.</p>

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
