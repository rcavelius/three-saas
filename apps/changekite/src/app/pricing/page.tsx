import type { Metadata } from "next";
import Link from "next/link";
import { paidPlans, CHANGEKITE_CATALOG } from "@repo/billing";
import { JsonLd } from "@/components/JsonLd";
import { PricingButton } from "@/components/PricingButton";
import { PassBuyButton } from "@/components/PassBuyButton";
import { PassReturnNotice, type PassReturnStatus } from "@/components/PassNotices";
import { Altitudes } from "@/components/Altitudes";
import { PageHero } from "@/components/ui";
import { reportOffer } from "@/lib/offer";
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
  const offer = reportOffer();
  const plans = paidPlans(CHANGEKITE_CATALOG).sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
  const white = "btn-primary w-full aria-disabled:opacity-60 disabled:opacity-60";
  return (
    <>
      <JsonLd data={softwareApplicationJsonLd(appUrl)} />
      <JsonLd data={faqJsonLd(PRICING_FAQ)} />
      <PageHero
        tone="cyan"
        art="/art/tag.webp"
        title="Free to scan. $9 to see it all."
        lede={`Scans are free and need no account. Pay ${passPrice(REPORT_PASS)} once for the full report, or monthly to have your sites watched.`}
      />
      <div className="mx-auto max-w-[1360px] px-5 pt-14 md:px-8 lg:px-12 lg:pt-20">
        {passStatus && <PassReturnNotice status={passStatus} expiresAt={activePass ? activePass.expiresAt.toISOString() : null} context="page" />}
        <Altitudes
          offer={offer}
          plans={plans}
          headingLevel="h2"
          actions={{
            free: (
              <Link href="/" className="btn-primary w-full">
                Run a free scan
              </Link>
            ),
            pass: activePass ? (
              <p className="text-[1rem] text-ink">
                Your pass is active until{" "}
                <span className="num font-bold">
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
                className="btn-primary w-full disabled:opacity-60"
              />
            ),
            plan: (p) => (
              <PricingButton
                planId={p.id}
                label={current === p.id ? "Your current plan" : `Choose ${p.name}`}
                mode={!viewer ? "signup" : subscribed ? "manage" : viewer.role === "owner" ? "checkout" : "owner-only"}
                disabled={current === p.id}
                className={white}
              />
            ),
          }}
        />
        <p className="mt-6 text-[1rem] text-muted">
          Prices in US dollars. Plans are billed monthly and can be cancelled any time; the pass is charged once and never renews. Taxes may apply where
          required.
        </p>

        <section aria-labelledby="compare" className="mt-24 lg:mt-32">
          <h2 id="compare" className="display text-[2.25rem] sm:text-[3.25rem]">
            Everything in each
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { name: "Free", items: planFeatures(CHANGEKITE_CATALOG.plans.find((p) => p.id === CHANGEKITE_CATALOG.freePlanId)!) },
              { name: `${REPORT_PASS.name} (${passPrice(REPORT_PASS)} once)`, items: passFeatures(REPORT_PASS) },
              ...plans.map((p) => ({ name: `${p.name} (${price(p)}/month)`, items: planFeatures(p) })),
            ].map((col) => (
              <div key={col.name} className="rounded-[24px] bg-white p-6">
                <h3 className="text-lg font-extrabold">{col.name}</h3>
                <ul className="mt-4 space-y-2 text-[1rem] leading-snug text-ink-soft">
                  {col.items.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <span aria-hidden="true" className="font-bold text-pass">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq" className="mt-24 grid gap-10 lg:mt-32 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 id="faq" className="display text-[2.25rem] sm:text-[3.25rem]">
            Questions
          </h2>
          <div className="grid gap-2">
            {PRICING_FAQ.map((f) => (
              <details key={f.q} className="group rounded-[20px] bg-white">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-[1.0625rem] font-bold [&::-webkit-details-marker]:hidden">
                  <span>{f.q}</span>
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-xl transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-6 pb-6 text-[1.0625rem] leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
