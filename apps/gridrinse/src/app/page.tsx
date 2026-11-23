import type { Metadata } from "next";
import Link from "next/link";
import { Cleaner } from "@/components/Cleaner";
import { HeroDrop } from "@/components/HeroDrop";
import { JsonLd } from "@/components/JsonLd";
import { PlanButton } from "@/components/PlanButton";
import { Shield, SpecimenFigure } from "@/components/SpecimenFigure";
import { AUDIENCES } from "@/content/audiences";
import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { formatBytes, formatLimit, processingLimits } from "@/lib/limits";
import { ogImage } from "@/lib/seo";
import { appUrl } from "@/lib/site";
import { displayPlans, freeProcessingLimits, softwareApplicationLd, upgradeOffers } from "@/server/plans";

const TITLE = "Free CSV & Excel cleaner: no upload, no account · GridRinse";
const DESCRIPTION =
  "Clean a messy CSV or Excel file in seconds: trim spaces, remove blank and duplicate rows, fix dates and numbers, merge files. Free, runs in your browser, never uploaded.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "GridRinse", title: TITLE, description: DESCRIPTION, url: "/", images: [ogImage()] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [ogImage().url] },
};

const FEATURES = [
  {
    title: "Clean up the clutter",
    body: "Remove blank rows, duplicates, and extra spaces.",
    tint: "bg-mint-soft",
    icon: (
      <path d="M12 3 2.5 8 12 13l9.5-5zM2.5 12 12 17l9.5-5M2.5 16 12 21l9.5-5" />
    ),
  },
  {
    title: "Make formats consistent",
    body: "Standardize dates and turn currency into usable numbers.",
    tint: "bg-lemon-soft",
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
        <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
        <path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01M16.5 17h.01" strokeWidth="2.6" />
      </>
    ),
  },
  {
    title: "Review before you export",
    body: "See every change. Unclear dates are flagged for you.",
    tint: "bg-sky-soft",
    icon: (
      <>
        <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" />
        <circle cx="12" cy="12" r="3.5" />
      </>
    ),
  },
];

const mb = (bytes: number) => formatBytes(bytes).replace(/\.0 /, " ");

export default function Home() {
  const free = freeProcessingLimits();
  const plans = displayPlans();
  return (
    <>
      <section className="mint-grid border-b-2 border-ink">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-10 pt-4 sm:px-8 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:pb-14">
          <div>
            <p className="text-[14px] font-extrabold uppercase tracking-[0.04em] sm:text-[16px]">Free · runs in your browser · no upload</p>
            <h1 className="display mt-3 text-[2.5rem] sm:text-[4rem] lg:text-[4.4rem]">Clean a messy CSV or Excel file in seconds.</h1>
            <p className="mt-4 max-w-[36rem] text-[17px] font-medium leading-snug sm:text-[20px]">
              Trim spaces, remove blank and duplicate rows, fix dates and money columns. See every change, then download. Your file never leaves your device.
            </p>
            <HeroDrop limitText={`.csv, .xlsx, .xls, .ods · free up to ${mb(free.maxFileBytes)} and ${free.maxRows.toLocaleString("en-US")} rows · no account`} />
            <p className="mt-4 flex items-center gap-2.5 text-[15px] font-medium sm:text-[16px]">
              <Shield /> Processed in your browser. Never uploaded.
            </p>
          </div>

          <SpecimenFigure />
        </div>
      </section>

      <div className="pt-8 sm:pt-10">
        <Cleaner freeLimits={free} offers={upgradeOffers()} emptyState="hidden" />
      </div>

      <section id="how-it-works" aria-labelledby="features-heading" className="mx-auto max-w-[1400px] scroll-mt-4 px-4 pb-16 sm:px-8">
        <h2 id="features-heading" className="display text-[2.2rem] sm:text-[3rem]">
          Clean data. Without the busywork.
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className={`card-pop flex items-start gap-4 p-5 sm:p-6 ${f.tint}`}>
              <svg className="mt-1 shrink-0" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {f.icon}
              </svg>
              <div>
                <h3 className="text-[21px] font-extrabold tracking-[-0.02em] sm:text-[23px]">{f.title}</h3>
                <p className="mt-1.5 text-[16px] font-medium leading-snug sm:text-[17px]">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="plans-heading" className="border-y-2 border-ink bg-paper">
        <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-8">
          <h2 id="plans-heading" className="display text-[2.2rem] sm:text-[3rem]">
            Free for everyday cleanups. Pro for big and repeat jobs.
          </h2>
          <p className="mt-3 max-w-3xl text-[17px] font-medium">Every plan has every cleaning step and cleans files in your browser. Paid plans raise the limits and keep your workflows in your account.</p>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {plans.map((p) => {
              const l = processingLimits(p.id, p.name, p.limits);
              const wf = p.limits.savedWorkflows ?? 0;
              return (
                <li key={p.id} className={`card-pop flex flex-col p-5 sm:p-6 ${p.id === "pro" ? "bg-lemon-soft" : ""}`}>
                  <p className="text-[22px] font-extrabold tracking-[-0.02em]">{p.name}</p>
                  <p className="mt-1 text-[15px] font-medium">
                    <span className="text-[30px] font-extrabold tracking-[-0.02em]">${p.priceMonthly}</span>
                    {p.priceMonthly > 0 ? " / month" : " · no account needed"}
                  </p>
                  <ul className="mt-3 flex-1 space-y-1.5 text-[16px] font-medium">
                    <li>Files up to {mb(l.maxFileBytes)}</li>
                    <li>{formatLimit(l.maxRows)} rows per file</li>
                    <li>{l.maxFiles} files at once (merge or batch)</li>
                    <li>{wf === 0 ? "Workflows saved in this browser" : wf < 0 ? "Unlimited workflows in your account" : `${wf} workflows in your account`}</li>
                    {p.features.sharedTeamWorkflows && <li>Shared team workflows, {p.limits.teamSeats} seats</li>}
                  </ul>
                  <div className="mt-5">
                    {p.id === "free" ? (
                      <a href="#main" className="btn-pop btn-pop-ghost w-full">
                        Use it free, no account
                      </a>
                    ) : (
                      <PlanButton planId={p.id} planName={p.name} primary={p.id === "pro"} from="home" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-5 text-[15px] font-medium">
            <Link href="/pricing" className="font-extrabold underline decoration-2 underline-offset-4">
              Compare plans in detail
            </Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="tools-heading" className="mx-auto max-w-[1400px] px-4 pb-6 pt-14 sm:px-8">
        <h2 id="tools-heading" className="text-[1.6rem] font-extrabold tracking-[-0.02em]">
          One job at a time
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <li key={t.slug}>
              <Link href={`/tools/${t.slug}`} className="inline-block rounded-full border-2 border-ink bg-surface px-3 py-1.5 text-[15px] font-semibold hover:bg-lemon-soft">
                {t.h1}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="guides-heading" className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-16 pt-8 sm:px-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <h2 id="guides-heading" className="text-[1.6rem] font-extrabold tracking-[-0.02em]">
            Guides
          </h2>
          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="text-[16px] font-semibold underline decoration-rule-strong decoration-2 underline-offset-4 hover:decoration-ink">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[1.6rem] font-extrabold tracking-[-0.02em]">Made for</h2>
          <ul className="mt-4 space-y-2">
            {AUDIENCES.map((a) => (
              <li key={a.slug}>
                <Link href={`/for/${a.slug}`} className="text-[16px] font-semibold underline decoration-rule-strong decoration-2 underline-offset-4 hover:decoration-ink">
                  {a.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <JsonLd data={softwareApplicationLd(appUrl())} />
    </>
  );
}
