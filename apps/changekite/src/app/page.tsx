import type { Metadata } from "next";
import Link from "next/link";
import { preload } from "react-dom";
import { CHANGEKITE_CATALOG, paidPlans } from "@repo/billing";
import { Scanner } from "@/components/Scanner";
import { ScoreDial } from "@/components/ScoreDial";
import { Burst, Star, Whoosh } from "@/components/KiteMark";
import { reportOffer } from "@/lib/offer";
import { JsonLd } from "@/components/JsonLd";
import { price, softwareApplicationJsonLd } from "@/lib/marketing";
import { env } from "@/lib/env";
import { EXAMPLE_HOST, exampleScore } from "@/lib/example-report";
import { TOOLS } from "@/content/tools";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// The kite is the phone's largest paint: a small file for phones, preloaded with the page.
const KITE_SRCSET = "/art/kite-sm.webp 259w, /art/kite.webp 406w";
const KITE_SIZES = "(min-width: 1024px) 265px, (min-width: 640px) 180px, 124px";

const GRADE_LABEL = { good: "In good order", fair: "Needs attention", poor: "Serious problems" } as const;

// The twelve checks in four groups of three. Each tile links to the first check of its group in /docs.
const GROUPS = [
  { title: "Pages & links", href: "/docs#internal-links", art: "/art/link.webp", w: 354, h: 360, bg: "bg-green", r: "-14deg" },
  { title: "Titles & descriptions", href: "/docs#titles", art: "/art/tag.webp", w: 360, h: 354, bg: "bg-pink", r: "10deg" },
  { title: "Search discovery", href: "/docs#sitemap", art: "/art/search.webp", w: 303, h: 360, bg: "bg-cyan", r: "-8deg" },
  { title: "HTTPS & security", href: "/docs#https", art: "/art/lock.webp", w: 262, h: 360, bg: "bg-orange", r: "8deg" },
];


export default function HomePage() {
  preload("/art/kite.webp", { as: "image", fetchPriority: "high", imageSrcSet: KITE_SRCSET, imageSizes: KITE_SIZES });
  const plans = paidPlans(CHANGEKITE_CATALOG).sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);
  const example = exampleScore();
  const offer = reportOffer();
  const free = TOOLS.filter((t) => !t.paid);
  const toPerfect = 100 - example.score;
  const promises = ["No account needed", "Obeys robots.txt", "Never logs in", "Never submits forms", `Up to ${offer.freePages} pages free`, "12 checks per scan", "Results in about a minute"];

  return (
    <div className="ck-home bg-ink px-2 pb-2">
      <JsonLd data={softwareApplicationJsonLd(new URL(env().APP_URL).origin)} />

      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-2 lg:grid-cols-12">
        {/* Hero: the headline and the real scan form. */}
        <section aria-labelledby="hero-title" className="tile col-span-2 bg-yellow px-6 pb-8 pt-7 sm:px-10 sm:pb-12 sm:pt-10 lg:col-span-7 lg:min-h-[600px] lg:px-14 lg:pb-14 lg:pt-14">
          <Star className="ck-twinkle absolute right-5 top-5 h-11 w-11 sm:right-8 sm:top-8 sm:h-16 sm:w-16" fill="var(--color-pink)" />
          <Star className="ck-twinkle absolute bottom-10 right-10 hidden h-10 w-10 lg:block" fill="var(--color-cyan)" />
          <p className="ck-in">
            <span className="chip">Free website health scan</span>
          </p>
          <h1 id="hero-title" className="display sticker ck-in mt-5 max-w-[11ch] text-[2.8rem] sm:text-[4.5rem] lg:text-[5.4rem] xl:text-[6rem]" style={{ ["--d" as string]: "60ms" }}>
            Find what&rsquo;s broken on your site.
          </h1>
          <Scanner layout="tile" offer={offer} resultsId="scan-results" />
        </section>

        {/* The mascot: the kite that reads your pages. */}
        <section aria-labelledby="kite-title" className="tile col-span-2 flex min-h-[250px] items-end bg-cyan bg-[repeating-linear-gradient(-45deg,transparent_0_28px,rgba(255,255,255,0.22)_28px_56px)] p-6 sm:min-h-[360px] sm:p-10 lg:col-span-5 lg:min-h-[600px]">
          <img
            src="/art/kite.webp"
            srcSet={KITE_SRCSET}
            sizes={KITE_SIZES}
            alt="ChangeKite's mascot: a glossy orange and pink kite with a smiling face and a tail of bows"
            width={406}
            height={720}
            fetchPriority="high"
            className="ck-float absolute right-[8%] top-4 h-[220px] w-auto sm:h-[320px] lg:right-[16%] lg:top-10 lg:h-[470px]"
            style={{ ["--r" as string]: "-8deg" }}
          />
          <Whoosh className="ck-pop absolute right-[48%] top-8 h-12 w-12 sm:right-[46%] lg:right-[52%] lg:top-16 lg:h-16 lg:w-16" />
          <div className="relative max-w-[55%] lg:max-w-[48%]">
            <h2 id="kite-title" className="display text-[1.6rem] leading-[1.05] sm:text-[2.25rem]">
              Reads up to {offer.freePages} pages.
            </h2>
            <p className="mt-2 text-[1.0625rem] font-bold">12 checks in about a minute.</p>
          </div>
        </section>

        {/* Scan progress and the report land here (empty until a scan starts). */}
        <div id="scan-results" className="col-span-2 scroll-mt-4 empty:hidden lg:col-span-12" />

        {/* The score: gamified, from the real scoring rules. */}
        <Link
          href="/docs#score"
          aria-labelledby="score-title"
          className="tile ck-reveal ck-lift col-span-2 flex flex-col items-center justify-center bg-white px-6 py-10 text-center lg:col-span-4 lg:row-span-2"
        >
          <span className="chip absolute left-5 top-5">Example score</span>
          <Star className="ck-twinkle absolute right-6 top-6 h-10 w-10" fill="var(--color-yellow)" />
          <h2 id="score-title" className="sr-only">
            Example score: {example.score} out of 100, {GRADE_LABEL[example.grade]}
          </h2>
          <div className="mt-6">
            <ScoreDial score={example.score} grade={example.grade} size={230} label={`Example score ${example.score} out of 100`} />
          </div>
          <Burst className="-mt-6 -rotate-6 px-3 text-[1.35rem]" fill="var(--color-yellow)">
            <span className="display leading-tight">{GRADE_LABEL[example.grade]}</span>
          </Burst>
          <p className="mt-4 text-[1.0625rem] font-extrabold">{toPerfect} points to a perfect 100</p>
          <p className="text-[0.95rem] font-semibold text-muted">{EXAMPLE_HOST} · illustrative</p>
        </Link>

        {/* The twelve checks, three per tile. */}
        {GROUPS.slice(0, 2).map((g, i) => (
          <CheckTile key={g.title} g={g} i={i} />
        ))}

        {/* The one-time full report: the gradient tile. */}
        <Link
          href="/pricing"
          aria-labelledby="price-title"
          className="tile ck-reveal ck-lift col-span-2 flex flex-col justify-between gap-6 bg-[linear-gradient(150deg,var(--color-pink),var(--color-orange))] p-7 sm:p-9 lg:col-span-4 lg:row-span-2"
          style={{ ["--d" as string]: "120ms" }}
        >
          <Star className="ck-twinkle absolute right-6 top-6 h-12 w-12" fill="var(--color-cyan)" />
          <span className="chip self-start">No subscription</span>
          <div>
            <p className="display num sticker-white text-[7rem] leading-none sm:text-[9rem]">{offer.price}</p>
            <h2 id="price-title" className="display mt-3 text-[2rem] leading-none sm:text-[2.5rem]">
              Full report. Once.
            </h2>
            <p className="mt-2 text-[1.0625rem] font-bold">Every issue and its fix.</p>
          </div>
          <span className="btn-primary self-start">
            See pricing <span aria-hidden="true">→</span>
          </span>
        </Link>

        {GROUPS.slice(2).map((g, i) => (
          <CheckTile key={g.title} g={g} i={i + 2} />
        ))}

        {/* Monitoring. */}
        <Link
          href="/pricing"
          aria-labelledby="watch-title"
          className="tile ck-reveal ck-lift col-span-2 flex min-h-[300px] flex-col justify-between gap-8 bg-cyan p-7 sm:p-9 lg:col-span-7"
        >
          <img src="/art/bell.webp" alt="" width={319} height={360} loading="lazy" className="ck-art ck-float pointer-events-none absolute right-6 top-6 h-32 w-auto sm:right-12 sm:h-44" style={{ ["--r" as string]: "12deg" }} />
          <span className="chip self-start">From {price(plans[0]!)}/month</span>
          <div className="max-w-[70%]">
            <h2 id="watch-title" className="display text-[2.25rem] leading-none sm:text-[3.25rem]">
              We&rsquo;ll keep watching.
            </h2>
            <p className="mt-3 text-[1.0625rem] font-bold">Scheduled re-scans. An email only when something breaks.</p>
            <p className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-4 py-2 font-extrabold">Re-scan every {plans[0]!.limits.scanFrequencyHours} h</span>
              <span className="rounded-full bg-white px-4 py-2 font-extrabold">Up to {plans[plans.length - 1]!.limits.sites} sites</span>
              <span className="rounded-full bg-white px-4 py-2 font-extrabold">History kept</span>
            </p>
          </div>
        </Link>

        {/* Free tools. */}
        <section aria-labelledby="tools-title" className="tile ck-reveal col-span-2 flex flex-col justify-between gap-6 bg-white p-7 sm:p-9 lg:col-span-5" style={{ ["--d" as string]: "90ms" }}>
          <img src="/art/wrench.webp" alt="" width={338} height={360} loading="lazy" className="ck-float pointer-events-none absolute right-6 top-6 h-24 w-auto sm:h-32" style={{ ["--r" as string]: "-18deg" }} />
          <div className="max-w-[70%]">
            <h2 id="tools-title" className="display text-[2.25rem] leading-none sm:text-[3rem]">
              {free.length} free checkers.
            </h2>
            <p className="mt-2 text-[1.0625rem] font-bold">One job each.</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {free.slice(0, 4).map((t) => (
              <li key={t.slug}>
                <Link href={`/tools/${t.slug}`} className="inline-flex min-h-11 items-center rounded-full bg-paper-deep px-4 font-extrabold transition-colors hover:bg-yellow">
                  {t.h1}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/tools" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 font-extrabold text-white">
                All tools →
              </Link>
            </li>
            <li>
              <Link href="/guides" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 font-extrabold text-white">
                Guides →
              </Link>
            </li>
          </ul>
        </section>

        {/* A ticker of plain promises. */}
        <div className="tile col-span-2 bg-pink py-5 lg:col-span-12" aria-label="What a scan does and doesn't do">
          <ul className="ck-marquee flex w-max gap-3">
            {[...promises, ...promises].map((p, i) => (
              <li key={i} aria-hidden={i >= promises.length} className="flex items-center gap-3">
                <span className="display whitespace-nowrap text-[1.6rem] sm:text-[2rem]">{p}</span>
                <Star className="h-7 w-7" fill="var(--color-yellow)" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CheckTile({ g, i }: { g: (typeof GROUPS)[number]; i: number }) {
  return (
    <Link
      href={g.href}
      className={`tile ck-reveal ck-lift col-span-1 flex min-h-[200px] flex-col justify-end p-5 sm:min-h-[240px] sm:p-7 lg:col-span-2 ${g.bg}`}
      style={{ ["--d" as string]: `${i * 70}ms` }}
    >
      <img
        src={g.art}
        alt=""
        width={g.w}
        height={g.h}
        loading="lazy"
        className="ck-art ck-float pointer-events-none absolute right-4 top-5 h-[72px] w-auto sm:h-24"
        style={{ ["--r" as string]: g.r, ["--d" as string]: `${i * 400}ms` }}
      />
      <span className="chip mb-3 self-start !px-2.5 !py-1 !text-[0.8rem]">3 checks</span>
      <h2 className="display text-[1.35rem] leading-[1.05] sm:text-[1.75rem]">{g.title}</h2>
    </Link>
  );
}
