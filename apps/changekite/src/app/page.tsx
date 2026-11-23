import type { Metadata } from "next";
import Link from "next/link";
import { CHANGEKITE_CATALOG, paidPlans } from "@repo/billing";
import { Scanner } from "@/components/Scanner";
import { reportOffer } from "@/lib/offer";
import { JsonLd } from "@/components/JsonLd";
import { KiteScan } from "@/components/home/KiteScan";
import { Tail } from "@/components/home/Tail";
import { ScoreLab } from "@/components/home/ScoreLab";
import { Altitudes } from "@/components/Altitudes";
import { KiteMark } from "@/components/SiteHeader";
import { softwareApplicationJsonLd } from "@/lib/marketing";
import { env } from "@/lib/env";
import { EXAMPLE_HOST, EXAMPLE_ISSUES, EXAMPLE_PAGES, exampleScore } from "@/lib/example-report";
import { TAIL, exampleBowStates } from "@/components/home/checks";
import { TOOLS } from "@/content/tools";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const SEV = {
  critical: { word: "Critical", cls: "bg-fail-wash text-fail" },
  warning: { word: "Warning", cls: "bg-warn-wash text-warn" },
  notice: { word: "Notice", cls: "bg-notice-wash text-notice" },
} as const;

const GUIDE_TONES = ["bg-kite text-night", "bg-ink text-white", "bg-sky-pale text-ink"];

export default function HomePage() {
  const plans = paidPlans(CHANGEKITE_CATALOG).sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
  const example = exampleScore();
  const offer = reportOffer();
  const tools = TOOLS.filter((t) => !t.paid).slice(0, 6);
  const states = exampleBowStates();
  const passed = TAIL.filter((c) => states[c.id] === "pass").length;
  const solo = plans[0]!;

  return (
    <>
      <JsonLd data={softwareApplicationJsonLd(new URL(env().APP_URL).origin)} />

      {/* Hero: a field of sky, the headline and the real scan form, and the kite (example scan). */}
      <section aria-labelledby="hero-title" className="relative -mt-px overflow-hidden bg-sky text-white">
        <div className="relative mx-auto grid max-w-[1360px] gap-x-10 px-5 pb-12 pt-6 md:px-8 lg:grid-cols-[1fr_1fr] lg:grid-rows-[auto_1fr] lg:px-12 lg:pb-24 lg:pt-14">
          <div className="lg:col-start-1 lg:row-start-1 lg:pt-10">
            <h1 id="hero-title" className="display ck-in text-[2.6rem] sm:display-xl sm:text-[4.6rem] lg:text-[5.4rem] xl:text-[6.4rem]">
              Keep your site flying.
            </h1>
            <p className="ck-in mt-4 max-w-[34ch] text-[1.0625rem] leading-[1.45] text-white sm:mt-7 sm:text-xl" style={{ ["--d" as string]: "80ms" }}>
              A free health check of up to {offer.freePages} pages: broken links, titles, sitemap, HTTPS and more, in about a minute.
            </p>
          </div>
          <div className="-mx-2 mt-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:mt-0 lg:self-center">
            <div className="mx-auto max-w-[300px] sm:max-w-[420px] lg:max-w-none">
              <KiteScan host={EXAMPLE_HOST} pages={EXAMPLE_PAGES} score={example.score} />
            </div>
            <p className="ck-in mt-1 text-center text-[0.9rem] font-medium text-white lg:-mt-4 lg:text-right" style={{ ["--d" as string]: "1400ms" }}>
              Example scan of {EXAMPLE_HOST}: {EXAMPLE_PAGES} pages, {passed} of 12 checks passed, score {example.score}.
            </p>
          </div>
          <Scanner layout="hero" offer={offer} />
        </div>
      </section>

      {/* The tail: twelve checks, each bow showing the example's result. */}
      <section aria-labelledby="checks" className="bg-white">
        <div className="mx-auto max-w-[1360px] px-5 py-24 md:px-8 lg:px-12 lg:py-36">
          <div className="ck-reveal flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <h2 id="checks" className="display max-w-[14ch] text-[2.6rem] sm:text-[4rem] lg:text-[4.75rem]">
              Twelve checks on one tail.
            </h2>
            <p className="max-w-[36ch] text-lg leading-relaxed text-ink-soft lg:pb-2">
              One scan runs every check. These bows show how the example site did: {passed} passed, three need work.
            </p>
          </div>
          <div className="mt-14 lg:mt-20">
            <Tail />
          </div>
          <p className="ck-reveal mt-14 max-w-3xl text-[1.0625rem] leading-relaxed text-ink-soft lg:mt-20">
            It reads the HTML your server sends, obeys robots.txt and never logs in or submits forms.{" "}
            <Link href="/docs" className="font-bold text-accent underline">
              How each check works
            </Link>
            {" · "}
            <Link href="/bot" className="font-bold text-accent underline">
              About the crawler
            </Link>
          </p>
        </div>
      </section>

      {/* The score: the live thing on the left, what the free scan hands you on the right. */}
      <section aria-labelledby="score">
        <div className="mx-auto grid max-w-[1360px] gap-x-16 gap-y-16 px-5 py-24 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:px-12 lg:py-36">
          <div>
            <h2 id="score" className="display ck-reveal text-[2.6rem] sm:text-[4rem] lg:text-[4.75rem]">
              One number. Fixes first.
            </h2>
            <p className="ck-reveal mt-5 max-w-[40ch] text-lg leading-relaxed text-ink-soft">
              Every site starts at 100 and loses points for what we find. Try it: change the example&rsquo;s issues.
            </p>
            <div className="ck-reveal mt-10">
              <ScoreLab initial={example.counts} />
            </div>
          </div>

          <div className="ck-reveal lg:pt-6" style={{ ["--d" as string]: "120ms" }}>
            <div className="rounded-[28px] bg-white p-6 sm:p-9">
              <p className="text-[0.95rem] font-bold text-muted">Example report · {EXAMPLE_HOST}</p>
              <h3 className="mt-2 text-2xl font-extrabold">Your top {offer.freeIssues} issues, free</h3>
              <ol className="mt-6 grid gap-3">
                {EXAMPLE_ISSUES.map((i) => (
                  <li key={i.id} className="rounded-2xl bg-paper p-5">
                    <p className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.85rem] font-bold ${SEV[i.severity].cls}`}>{SEV[i.severity].word}</p>
                    <p className="mt-2 text-[1.125rem] font-extrabold leading-snug">{i.message}</p>
                    <p className="mt-1.5 text-[1rem] leading-relaxed text-ink-soft">
                      <span className="font-bold text-ink">Fix: </span>
                      {i.howToFix}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-sky p-5 text-white">
                <p className="max-w-[30ch] text-[1.0625rem] font-semibold">Every other issue, with its fix, is in the full report.</p>
                <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 font-bold text-ink transition-transform hover:scale-[1.03] active:scale-95">
                  {offer.price} once
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Monitoring: a week of example scans; the string only tugs when something changes. */}
      <section aria-labelledby="monitoring" className="bg-ink text-white">
        <div className="mx-auto max-w-[1360px] px-5 py-24 md:px-8 lg:px-12 lg:py-36">
          <div className="ck-reveal flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <h2 id="monitoring" className="display max-w-[16ch] text-[2.6rem] sm:text-[4rem] lg:text-[4.75rem]">
              The wind changes. You hear about it.
            </h2>
            <p className="max-w-[36ch] text-lg leading-relaxed text-white/85 lg:pb-2">
              Plans re-scan your sites every {solo.limits.scanFrequencyHours} hours (Agency: every {plans[1]!.limits.scanFrequencyHours}) and email you only when something new goes wrong.
            </p>
          </div>
          <ol className="mt-14 grid grid-cols-7 gap-1.5 sm:gap-3 lg:mt-20" aria-label="An example week of scheduled scans">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => {
              const alert = i === 2 ? "fail" : i === 5 ? "warn" : null;
              return (
                <li key={d} className="ck-reveal flex flex-col items-center" style={{ ["--d" as string]: `${i * 60}ms` }}>
                  <span
                    className={`grid h-16 w-full place-items-center rounded-2xl sm:h-24 ${alert === "fail" ? "bg-bow-fail" : alert === "warn" ? "bg-bow-warn" : "bg-white/10"}`}
                  >
                    <KiteMark className="h-7 w-7 sm:h-10 sm:w-10" tail={alert ? "var(--color-ink)" : "#fff"} />
                  </span>
                  <span className="mt-2 text-[0.9rem] font-bold text-white/85">{d}</span>
                  <span className="sr-only">{alert === "fail" ? ": alert sent" : alert === "warn" ? ": alert sent" : ": no change, no email"}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              { day: "Wednesday", tone: "bg-bow-fail", title: "A new broken link appeared", body: "/menu links to /order-now, which now answers 404." },
              { day: "Saturday", tone: "bg-bow-warn", title: "Your certificate expires in 21 days", body: "Renew it before visitors see a full-page warning." },
            ].map((a, i) => (
              <div key={a.day} className="ck-reveal flex gap-4 rounded-[22px] bg-white p-6 text-ink" style={{ ["--d" as string]: `${200 + i * 90}ms` }}>
                <span aria-hidden="true" className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${a.tone}`} />
                <div>
                  <p className="text-[0.95rem] font-bold text-muted">Example alert · {a.day}</p>
                  <p className="mt-1 text-xl font-extrabold">{a.title}</p>
                  <p className="mt-1 text-[1.0625rem] text-ink-soft">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="ck-reveal mt-6 text-[1rem] text-white/85">The other five days: scans ran, nothing changed, no email.</p>
        </div>
      </section>

      {/* Pricing: three altitudes. */}
      <section aria-labelledby="plans">
        <div className="mx-auto max-w-[1360px] px-5 py-24 md:px-8 lg:px-12 lg:py-36">
          <div className="ck-reveal flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
            <h2 id="plans" className="display text-[2.6rem] sm:text-[4rem] lg:text-[4.75rem]">
              Pick your altitude.
            </h2>
            <Link href="/pricing" className="text-lg font-bold text-accent underline lg:pb-2">
              Compare everything on the pricing page
            </Link>
          </div>
          <div className="mt-14 lg:mt-20">
            <Altitudes
              offer={offer}
              plans={plans}
              actions={{
                free: (
                  <a href="#scan" className="btn-primary w-full">
                    Scan free
                  </a>
                ),
                pass: (
                  <Link href="/pricing" className="btn-primary w-full">
                    Get the full report
                  </Link>
                ),
                plan: (p) => (
                  <Link href="/pricing" className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-white px-6 font-bold text-ink transition-transform hover:scale-[1.02] active:scale-95">
                    Choose {p.name}
                  </Link>
                ),
              }}
            />
          </div>
        </div>
      </section>

      {/* Tools and guides: single jobs and short reads. */}
      <section aria-labelledby="resources" className="bg-white">
        <div className="mx-auto max-w-[1360px] px-5 py-24 md:px-8 lg:px-12 lg:py-36">
          <h2 id="resources" className="display ck-reveal text-[2.6rem] sm:text-[4rem] lg:text-[4.75rem]">
            One job at a time.
          </h2>
          <div className="mt-12 grid gap-x-16 gap-y-14 lg:mt-16 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h3 className="ck-reveal text-xl font-extrabold">Free checkers</h3>
              <ul className="mt-4">
                {tools.map((t, i) => (
                  <li key={t.slug} className="ck-reveal" style={{ ["--d" as string]: `${i * 50}ms` }}>
                    <Link
                      href={`/tools/${t.slug}`}
                      className="group -mx-4 flex items-center justify-between gap-6 rounded-2xl px-4 py-4 transition-colors hover:bg-sky-pale"
                    >
                      <span className="font-display text-[1.375rem] leading-tight sm:text-[1.75rem]">{t.h1}</span>
                      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper text-xl transition-transform group-hover:translate-x-1 group-hover:bg-white">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/tools" className="mt-4 inline-block text-lg font-bold text-accent underline">
                All {TOOLS.length} tools
              </Link>
            </div>
            <div>
              <h3 className="ck-reveal text-xl font-extrabold">Guides</h3>
              <ul className="mt-4 grid gap-3">
                {GUIDES.map((g, i) => (
                  <li key={g.slug} className="ck-reveal" style={{ ["--d" as string]: `${i * 80}ms` }}>
                    <Link href={`/guides/${g.slug}`} className={`ck-lift group flex min-h-[150px] flex-col justify-between gap-6 rounded-[26px] p-6 sm:p-7 ${GUIDE_TONES[i % 3]}`}>
                      <span className="font-display text-[1.5rem] leading-[1.1] sm:text-[1.75rem]">{g.title}</span>
                      <span className="font-bold">
                        Read the guide <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Close: back to the one form. */}
      <section aria-labelledby="cta" className="px-5 pt-24 md:px-8 lg:px-12 lg:pt-32">
        <div className="ck-reveal relative mx-auto flex max-w-[1360px] flex-col items-start gap-8 overflow-hidden rounded-[32px] bg-sky px-7 py-14 text-white sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:py-20">
          <div className="flex items-center gap-6">
            <KiteMark className="h-20 w-20 shrink-0 -rotate-6 sm:h-28 sm:w-28" />
            <h2 id="cta" className="display text-[2.4rem] sm:text-[3.6rem]">
              Ready for a look?
            </h2>
          </div>
          <a href="#scan" className="btn-primary min-h-[3.75rem] !px-9 text-lg">
            Scan your site free <span aria-hidden="true">↑</span>
          </a>
        </div>
      </section>
    </>
  );
}
