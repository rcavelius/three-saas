import type { Metadata } from "next";
import Link from "next/link";
import { CHANGEKITE_CATALOG, paidPlans } from "@repo/billing";
import { Scanner } from "@/components/Scanner";
import { reportOffer } from "@/lib/offer";
import { JsonLd } from "@/components/JsonLd";
import { ExampleReport } from "@/components/home/ExampleReport";
import { ScoreLab } from "@/components/home/ScoreLab";
import { planFeatures, price, softwareApplicationJsonLd } from "@/lib/marketing";
import { env } from "@/lib/env";
import { CHECK_DOCS } from "@/lib/check-docs";
import type { CheckId } from "@/lib/scanner/types";
import { exampleScore } from "@/lib/example-report";
import { FREE_LIMITS } from "@/lib/scanner/scan";
import { TOOLS } from "@/content/tools";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = { alternates: { canonical: "/" } };

function firstSentence(s: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(s);
  return (m ? m[0] : s).trim();
}

const GROUPS: { title: string; line: string; ids: CheckId[]; icon: React.ReactNode }[] = [
  {
    title: "Pages & links",
    line: "Every page answers, and every link goes somewhere.",
    ids: ["status", "internal-links", "external-links"],
    icon: <path d="M9 15l6-6M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8" />,
  },
  {
    title: "Content clarity",
    line: "What people and search engines read about each page.",
    ids: ["titles", "meta-description", "images"],
    icon: <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />,
  },
  {
    title: "Search discovery",
    line: "Whether search engines can find the pages you care about.",
    ids: ["canonical", "sitemap", "robots"],
    icon: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />,
  },
  {
    title: "Security & coverage",
    line: "A trusted connection, and how much of the site we reached.",
    ids: ["https", "mixed-content", "crawl"],
    icon: <path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6z" />,
  },
];

const ALERTS = [
  { title: "Your site stops answering", body: "The start page goes down, or comes back up." },
  { title: "A new broken link appears", body: "Only links that were not broken in the previous scan." },
  { title: "Your certificate is about to expire", body: "Warned while there is still time to renew." },
];

export default function HomePage() {
  const docs = new Map(CHECK_DOCS.map((c) => [c.id, c]));
  const plans = paidPlans(CHANGEKITE_CATALOG).sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
  const example = exampleScore();
  const offer = reportOffer();
  const tools = TOOLS.filter((t) => !t.paid).slice(0, 5);

  return (
    <>
      <JsonLd data={softwareApplicationJsonLd(new URL(env().APP_URL).origin)} />

      {/* Hero: headline and the real scan form on the left, the report (example data) on the right. */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <svg aria-hidden="true" className="pointer-events-none absolute -right-24 top-24 hidden h-[640px] w-[760px] text-sky lg:block" viewBox="0 0 760 640">
          <path d="M120 40 760 0v640L0 560Z" fill="currentColor" />
        </svg>
        <div className="relative mx-auto grid max-w-7xl gap-x-14 gap-y-6 px-5 pb-[72px] pt-8 md:px-8 lg:grid-cols-[44fr_56fr] lg:grid-rows-[auto_1fr] lg:gap-y-10 lg:px-12 lg:pb-28 lg:pt-16">
          <div className="lg:col-start-1 lg:row-start-1">
            <p className="eyebrow ck-in">Website health scanner</p>
            <h1
              id="hero-title"
              className="display ck-in mt-4 text-[44px] leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-[4.6rem] xl:text-[82px]"
              style={{ ["--d" as string]: "40ms" }}
            >
              Find what&rsquo;s broken on your site before your visitors do.
            </h1>
            <p className="ck-in mt-4 max-w-[35ch] text-base leading-[1.5] text-ink-soft sm:mt-7 sm:text-lg" style={{ ["--d" as string]: "100ms" }}>
              Scan up to {offer.freePages} pages for broken links, missing details and security issues. In about a minute you get the score, every
              check&rsquo;s result and the top {offer.freeIssues} issues with fixes, free. The full report is {offer.price} one-time.
            </p>
          </div>
          <div className="order-last lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <ExampleReport />
          </div>
          <Scanner layout="hero" offer={offer} />
        </div>
      </section>

      {/* The score, explained: the page's one live thing. */}
      <section aria-labelledby="score" className="bg-sheet">
        <div className="mx-auto max-w-7xl px-5 py-[72px] md:px-8 lg:px-12 lg:py-28">
          <div className="ck-reveal max-w-3xl">
            <h2 id="score" className="display text-[34px] tracking-[-0.035em] sm:text-5xl">
              A score you can actually understand.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">
              Every report starts at 100 and loses points for what it finds. Try it: the example above has one critical issue, one warning and one
              notice, so it scores {example.score}.{" "}
              <Link href="/docs" className="font-semibold text-accent underline">
                How each check is graded
              </Link>
            </p>
          </div>
          <div className="ck-reveal mx-auto mt-12 max-w-[1120px]">
            <ScoreLab initial={example.counts} />
          </div>
        </div>
      </section>

      {/* What we check: four groups of three, each check with its one-line reason. */}
      <section aria-labelledby="checks">
        <div className="mx-auto max-w-7xl px-5 py-[72px] md:px-8 lg:px-12 lg:py-28">
          <div className="ck-reveal flex flex-wrap items-end justify-between gap-6">
            <h2 id="checks" className="display max-w-3xl text-[34px] tracking-[-0.035em] sm:text-5xl">
              Twelve checks. No technical translation required.
            </h2>
            <Link href="/docs" className="btn-secondary">
              How each check works <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="mt-14 grid gap-x-16 gap-y-14 lg:grid-cols-2">
            {GROUPS.map((g, gi) => (
              <section key={g.title} aria-labelledby={`g-${g.ids[0]}`} className="ck-reveal border-t border-[#dad5cb] pt-5">
                <p className="num text-xs font-extrabold text-accent">0{gi + 1}</p>
                <div className="mt-4 flex items-start justify-between gap-6">
                  <div>
                    <h3 id={`g-${g.ids[0]}`} className="text-[22px] font-extrabold tracking-[-0.025em]">
                      {g.title}
                    </h3>
                    <p className="mt-1 text-[0.95rem] text-ink-soft">{g.line}</p>
                  </div>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-1 h-6 w-6 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {g.icon}
                  </svg>
                </div>
                <ul className="mt-4">
                  {g.ids.map((id) => {
                    const c = docs.get(id)!;
                    return (
                      <li key={id} className="grid gap-1 border-t border-rule py-[18px] sm:grid-cols-[38fr_62fr] sm:gap-6">
                        <Link href={`/docs#${id}`} className="text-[15px] font-bold text-ink hover:text-accent">
                          {c.title}
                        </Link>
                        <p className="text-[15px] leading-[1.5] text-muted">{firstSentence(c.why)}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </section>

      {/* Scope: what a free scan is, and is not. */}
      <section aria-labelledby="limits" className="bg-[#191d29] text-[#d2d7e0]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[360px_1fr_1fr] lg:gap-14 lg:px-12 lg:py-[88px]">
          <h2 id="limits" className="display ck-reveal text-[34px] tracking-[-0.035em] text-[#f7f3ea] sm:text-5xl">
            A useful first look. Not a mystery audit.
          </h2>
          <div className="ck-reveal text-base leading-[1.6]">
            <h3 className="text-sm font-extrabold text-white">What it does</h3>
            <ul className="mt-6 space-y-4">
              <li>
                Starts at the address you enter and follows links on the same site: up to {FREE_LIMITS.maxPages} pages, {FREE_LIMITS.maxDepth} clicks
                deep, {FREE_LIMITS.concurrency} requests at a time with a pause between them, for about {Math.round(FREE_LIMITS.timeBudgetMs / 1000)}{" "}
                seconds.
              </li>
              <li>
                Gives you the score, the result of every check and the {offer.freeIssues} most severe issues with fixes, free. The {offer.name} pass
                ({offer.price} once, no subscription, no account) unlocks every issue and fix on every report for {offer.duration}, scans of up to{" "}
                {offer.pagesPerScan} pages{offer.pdf ? " and PDF export" : ""}.
              </li>
              <li>
                Says what it did not reach, so a clean result is never mistaken for a complete one. It identifies itself as ChangeKiteBot/1.0 and obeys
                robots.txt.{" "}
                <Link href="/bot" className="font-semibold text-white underline">
                  About the crawler
                </Link>
              </li>
            </ul>
          </div>
          <div className="ck-reveal text-base leading-[1.6]">
            <h3 className="text-sm font-extrabold text-white">What it doesn&rsquo;t</h3>
            <ul className="mt-6 space-y-4">
              <li>It does not run JavaScript, log in, submit forms or measure speed. It reads the HTML your server sends, which is what most crawlers see first.</li>
              <li>It is a snapshot of one moment, not monitoring. Scheduled re-scans are what the paid plans are for.</li>
              <li>It cannot promise rankings. Nothing honest can.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Monitoring: scan, compare, notify. */}
      <section aria-labelledby="monitoring">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-[72px] md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-12 lg:py-28">
          <div className="ck-reveal">
            <h2 id="monitoring" className="display text-[34px] tracking-[-0.035em] sm:text-5xl">
              Your website changes. Your watch doesn&rsquo;t have to.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-soft">
              The paid plans re-scan the sites you look after on a schedule, keep the history and compare each scan with the last. You get an email only
              when something meaningful changes, not a digest of everything that stayed the same.
            </p>
            <ol className="mt-8 flex flex-wrap items-center gap-2 text-[0.95rem] font-bold">
              {["Scan on schedule", "Compare with last scan", "Email if it matters"].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-rule-strong">
                      →
                    </span>
                  )}
                  <span className="rounded-full bg-accent-wash px-3.5 py-1.5 text-accent">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative">
            <div aria-hidden="true" className="absolute bottom-8 left-[27px] top-8 w-px bg-rule-strong/60 sm:left-[31px]" />
            <ul className="relative grid gap-4">
              {ALERTS.map((a, i) => (
                <li key={a.title} className="card ck-reveal flex items-start gap-4 !rounded-[20px] p-5 sm:p-6">
                  <span
                    aria-hidden="true"
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold sm:h-11 sm:w-11 ${i === 1 ? "bg-fail-wash text-fail" : i === 2 ? "bg-warn-wash text-warn" : "bg-notice-wash text-notice"}`}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 5h14v10H3zM3 5l7 6 7-6" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[0.8rem] font-bold text-muted">Example alert</p>
                    <p className="text-lg font-extrabold tracking-[-0.02em]">{a.title}</p>
                    <p className="mt-1 text-ink-soft">{a.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing teaser, from the same catalog as /pricing. */}
      <section aria-labelledby="plans" className="bg-[#edf2f3]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-12 lg:py-[88px]">
          <div className="ck-reveal">
            <h2 id="plans" className="display text-[34px] tracking-[-0.035em] sm:text-5xl">
              Two plans for staying ahead.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">One-off scans stay free. Pay when you want your sites watched.</p>
            <Link href="/pricing" className="btn-primary mt-8">
              See pricing <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {plans.map((p) => (
              <Link key={p.id} href="/pricing" className="ck-reveal ck-lift group flex flex-col rounded-2xl bg-white p-7 shadow-[0_0_0_1px_var(--color-rule)]">
                <p className="text-[22px] font-extrabold tracking-[-0.03em]">{p.name}</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="num text-[42px] font-extrabold tracking-[-0.04em]">{price(p)}</span>
                  <span className="font-semibold text-muted">/month</span>
                </p>
                <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-rule py-4 text-center">
                  <div>
                    <dt className="text-xs font-semibold text-muted">Sites</dt>
                    <dd className="num mt-0.5 text-lg font-extrabold">{p.limits.sites}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">Re-scan every</dt>
                    <dd className="num mt-0.5 text-lg font-extrabold">{p.limits.scanFrequencyHours} h</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted">Pages / scan</dt>
                    <dd className="num mt-0.5 text-lg font-extrabold">{p.limits.pagesPerScan!.toLocaleString("en-US")}</dd>
                  </div>
                </dl>
                <ul className="mt-5 flex-1 space-y-2 text-sm leading-[1.5] text-ink-soft">
                  {planFeatures(p)
                    .slice(3)
                    .map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <span aria-hidden="true" className="font-bold text-pass">
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                </ul>
                <p className="mt-6 font-bold text-accent">
                  Compare plans <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Tools and guides. */}
      <section aria-labelledby="resources">
        <div className="mx-auto max-w-7xl px-5 py-[72px] md:px-8 lg:px-12 lg:py-28">
          <h2 id="resources" className="display ck-reveal text-[34px] tracking-[-0.035em] sm:text-5xl">
            Not ready to scan? Start here.
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-16">
            <div className="ck-reveal">
              <h3 className="text-lg font-extrabold">Free tools</h3>
              <ul className="mt-3">
                {tools.map((t) => (
                  <li key={t.slug} className="border-b border-rule">
                    <Link href={`/tools/${t.slug}`} className="group flex items-center justify-between gap-4 py-3.5 font-semibold hover:text-accent">
                      {t.h1}
                      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/tools" className="mt-4 inline-block font-bold text-accent underline">
                All tools
              </Link>
            </div>
            <div className="ck-reveal">
              <h3 className="text-lg font-extrabold">Guides</h3>
              <ul className="mt-3">
                {GUIDES.map((g) => (
                  <li key={g.slug} className="border-b border-rule">
                    <Link href={`/guides/${g.slug}`} className="group flex items-center justify-between gap-4 py-3.5 font-semibold hover:text-accent">
                      {g.title}
                      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/guides" className="mt-4 inline-block font-bold text-accent underline">
                All guides
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Closing call to action: back to the one form, no second input. */}
      <section aria-labelledby="cta" className="px-5 md:px-8 lg:px-12">
        <div className="ck-reveal mx-auto flex max-w-7xl flex-col items-start gap-6 rounded-2xl bg-accent px-6 py-9 text-white sm:px-11 lg:flex-row lg:items-center lg:justify-between">
          <h2 id="cta" className="font-display text-[32px] font-semibold leading-tight tracking-[-0.035em] text-white">
            See your website more clearly.
          </h2>
          <a href="#hero-title" className="inline-flex min-h-[52px] items-center rounded-xl bg-white px-6 text-[15px] font-extrabold text-accent-hover transition-transform hover:scale-[1.02] active:scale-95">
            Run a free scan <span aria-hidden="true">&nbsp;↑</span>
          </a>
        </div>
      </section>
    </>
  );
}
