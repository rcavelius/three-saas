import type { Metadata } from "next";
import Link from "next/link";
import { Art } from "@/components/Art";
import { Cleaner } from "@/components/Cleaner";
import { HeroDrop } from "@/components/HeroDrop";
import { JsonLd } from "@/components/JsonLd";
import { PlanButton } from "@/components/PlanButton";
import { RinseCard } from "@/components/RinseCard";
import { AUDIENCES } from "@/content/audiences";
import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { formatBytes, formatLimit, processingLimits } from "@/lib/limits";
import { ogImage } from "@/lib/seo";
import { appUrl } from "@/lib/site";
import { displayPlans, freeProcessingLimits, passOffer, softwareApplicationLd, upgradeOffers } from "@/server/plans";

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

const STEPS = [
  { word: "Drop", line: "CSV, TSV, Excel or ODS, straight from your desktop.", art: "sheet" as const, tint: "bg-mint" },
  { word: "Rinse", line: "Spaces trimmed. Blanks and duplicates gone. Dates and money fixed.", art: "bubbles" as const, tint: "bg-pink" },
  { word: "Download", line: "See every change first. Then export CSV or Excel.", art: "trophy" as const, tint: "bg-surface" },
] as const;

const FIXES = [
  "Extra spaces",
  "Blank rows",
  "Duplicate rows",
  "Jan 17, 2024 → 2024-01-17",
  "$1,234.50 → 1234.50",
  "(45.00) → -45.00",
  "Merge files",
  "Ambiguous dates flagged, never guessed",
];

const mb = (bytes: number) => formatBytes(bytes).replace(/\.0 /, " ");

export default function Home() {
  const free = freeProcessingLimits();
  const plans = displayPlans();
  const pass = passOffer();
  return (
    <>
      <section className="mint-grid overflow-hidden">
        <div className="mx-auto grid max-w-[1400px] items-center gap-x-12 gap-y-10 px-4 pb-14 pt-6 sm:px-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:pb-24">
          <div className="min-w-0">
            <h1 className="display display-out rise text-[clamp(4.1rem,18vw,8.6rem)] leading-[0.9] lg:text-[clamp(5rem,8.2vw,8.6rem)]">
              Messy in.
              <br />
              Clean out.
            </h1>
            <p className="rise mt-4 max-w-[34rem] text-[18px] font-semibold leading-snug [animation-delay:80ms] sm:mt-6 sm:text-[21px]">
              Clean CSV and Excel files in your browser. Your file never leaves your device.
            </p>
            <div className="rise relative mt-[4.2rem] [animation-delay:160ms] sm:mt-8">
              <HeroDrop limitText={`.csv, .xlsx, .xls, .ods · free up to ${mb(free.maxFileBytes)} and ${free.maxRows.toLocaleString("en-US")} rows · no account`} />
              <Art name="mascot-sm" eager className="float pointer-events-none absolute -top-[5.4rem] right-1 h-auto w-[128px] sm:hidden" />
            </div>
          </div>

          <div className="relative min-w-0 lg:pl-6">
            <RinseCard />
            <Art name="mascot" className="float pointer-events-none absolute -bottom-16 -left-20 hidden h-auto w-[250px] lg:block xl:-left-24 xl:w-[290px]" />
          </div>
        </div>
      </section>

      <div className="pt-10 sm:pt-14">
        <Cleaner freeLimits={free} offers={upgradeOffers()} pass={pass} emptyState="hidden" />
      </div>

      <section id="how-it-works" aria-labelledby="cycle-heading" className="mx-auto max-w-[1400px] scroll-mt-4 px-4 py-16 sm:px-8 sm:py-24">
        <h2 id="cycle-heading" className="display text-[clamp(3rem,9vw,6.5rem)]">
          The rinse cycle
        </h2>
        <ol className="mt-8 grid gap-5 sm:mt-10 lg:grid-cols-3 lg:gap-6">
          {STEPS.map((s) => (
            <li key={s.word} className={`card-pop flex items-center gap-4 p-5 sm:gap-6 sm:p-7 lg:min-h-[360px] lg:flex-col lg:items-start lg:justify-between ${s.tint}`}>
              <Art name={s.art} className="float h-auto w-[84px] shrink-0 sm:w-[110px] lg:w-[150px]" />
              <div>
                <h3 className="display text-[2.7rem] sm:text-[3.6rem]">{s.word}</h3>
                <p className="mt-1 max-w-[22rem] text-[17px] font-semibold leading-snug sm:text-[19px]">{s.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="What gets fixed" className="overflow-hidden bg-ink py-5 text-white sm:py-7">
        <ul className="marquee flex w-max whitespace-nowrap">
          {[...FIXES, ...FIXES].map((f, i) => (
            <li key={i} className="display flex items-center gap-10 pr-10 text-[2rem] sm:text-[2.9rem]" aria-hidden={i >= FIXES.length ? true : undefined}>
              {f}
              <span className="inline-block size-4 rotate-45 bg-mint" aria-hidden="true" />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="private-heading" className="bg-pink">
        <div className="mx-auto grid max-w-[1400px] items-center gap-8 px-4 py-16 sm:px-8 sm:py-24 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14">
          <Art name="lock" className="float mx-auto h-auto w-[140px] sm:w-[200px]" />
          <div>
            <h2 id="private-heading" className="display text-[clamp(3.2rem,11vw,7.5rem)]">
              Never uploaded.
            </h2>
            <p className="mt-4 max-w-[40rem] text-[19px] font-semibold leading-snug sm:text-[23px]">
              Your file is read, cleaned and exported by your own browser. Our security policy blocks the page from sending data to any other server.
            </p>
            <Link href="/how-it-works" className="mt-6 inline-block text-[18px] font-extrabold underline decoration-[3px] underline-offset-[5px] hover:decoration-accent">
              How it works
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="plans-heading" className="mint-grid">
        <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-8 sm:py-24">
          <h2 id="plans-heading" className="display display-out text-[clamp(3.4rem,10vw,6.5rem)]">
            Free to rinse.
          </h2>
          <p className="mt-4 max-w-[40rem] text-[19px] font-semibold leading-snug sm:text-[21px]">Every plan has every cleaning step. Paid plans raise the limits.</p>
          <ul className="ink-zone mt-10 grid gap-6 md:grid-cols-3">
            {plans.map((p) => {
              const l = processingLimits(p.id, p.name, p.limits);
              const wf = p.limits.savedWorkflows ?? 0;
              return (
                <li key={p.id} className={`card-pop lift flex flex-col p-6 sm:p-7 ${p.id === "pro" ? "bg-mint" : ""}`}>
                  <h3 className="text-[24px] font-extrabold tracking-[-0.02em]">{p.name}</h3>
                  <p className="mt-1 flex items-baseline gap-2.5 text-[16px] font-bold">
                    <span className="display text-[4.4rem] leading-none">${p.priceMonthly}</span>
                    {p.priceMonthly > 0 ? "/ month" : "no account needed"}
                  </p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-[16px] font-semibold">
                    <li>Files up to {mb(l.maxFileBytes)}</li>
                    <li>{formatLimit(l.maxRows)} rows per file</li>
                    <li>{l.maxFiles} files at once (merge or batch)</li>
                    <li>
                      {l.downloadRows < 0 && l.downloadsPerDay < 0
                        ? "Unlimited downloads"
                        : `${l.downloadsPerDay === 1 ? "One download a day" : `${formatLimit(l.downloadsPerDay)} downloads a day`}, up to ${formatLimit(l.downloadRows)} rows`}
                    </li>
                    <li>{wf === 0 ? "Workflows saved in this browser" : wf < 0 ? "Unlimited workflows in your account" : `${wf} workflows in your account`}</li>
                    {p.features.sharedTeamWorkflows && <li>Shared team workflows, {p.limits.teamSeats} seats</li>}
                  </ul>
                  <div className="mt-6">
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
          {pass && (
            <div className="card-pop mt-8 flex flex-col gap-4 bg-pink p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-7">
              <p className="display shrink-0 text-[5.5rem] leading-none">${pass.price}</p>
              <p className="flex-1 text-[18px] font-bold leading-snug sm:text-[20px]">
                One-off job? The {pass.name} is one payment and needs no account: Pro&apos;s file limits and unlimited downloads for {pass.durationHours} hours.
              </p>
              <Link href="/pricing" className="btn-pop btn-pop-ghost shrink-0">
                Compare plans
              </Link>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="tools-heading" className="mx-auto max-w-[1400px] px-4 pb-6 pt-16 sm:px-8 sm:pt-24">
        <h2 id="tools-heading" className="display text-[clamp(2.6rem,7vw,4.8rem)]">
          One job at a time
        </h2>
        <ul className="mt-6 flex flex-wrap gap-2.5">
          {TOOLS.map((t) => (
            <li key={t.slug}>
              <Link href={`/tools/${t.slug}`} className="lift inline-block rounded-full border-[3px] border-ink bg-surface px-4 py-2 text-[16px] font-bold shadow-[3px_3px_0_#0a0a0a] hover:bg-mint">
                {t.h1}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="guides-heading" className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-20 pt-12 sm:px-8 sm:pb-28 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <h2 id="guides-heading" className="display text-[2.6rem] sm:text-[3.2rem]">
            Guides
          </h2>
          <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="text-[17px] font-bold underline decoration-rule-strong decoration-[3px] underline-offset-4 hover:decoration-accent">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="display text-[2.6rem] sm:text-[3.2rem]">Made for</h2>
          <ul className="mt-4 space-y-2.5">
            {AUDIENCES.map((a) => (
              <li key={a.slug}>
                <Link href={`/for/${a.slug}`} className="text-[17px] font-bold underline decoration-rule-strong decoration-[3px] underline-offset-4 hover:decoration-accent">
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
