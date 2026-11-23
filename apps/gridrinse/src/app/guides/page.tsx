import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Art } from "@/components/Art";
import { GuideBrowser } from "@/components/GuideBrowser";
import { AUDIENCES } from "@/content/audiences";
import { GUIDE_CATEGORIES, GUIDES } from "@/content/guides";

export const metadata: Metadata = pageMeta({
  title: "Resources",
  description: "Practical guides for cleaner files, smoother imports and fewer formatting headaches: dates, duplicates, number formats, encodings and privacy.",
  path: "/guides",
});

const INK = "#111";

function Doc({ x, label, tag, rotate }: { x: number; label: string; tag: string; rotate: number }) {
  return (
    <g transform={`rotate(${rotate} ${x + 90} 120)`}>
      <path d={`M${x} 20h130l40 40v150a6 6 0 0 1-6 6H${x + 6}a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z`} fill="#fff" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d={`M${x + 130} 20v40h40`} fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <rect x={x + 18} y="40" width="80" height="36" rx="6" fill={tag} stroke={INK} strokeWidth="4" />
      <text x={x + 58} y="66" textAnchor="middle" fontFamily="var(--font-jakarta), sans-serif" fontWeight="800" fontSize="20" fill={INK}>
        {label}
      </text>
      <rect x={x + 18} y="96" width="134" height="96" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x={x + 18} y="96" width="134" height="20" fill="#c6ff3a" stroke={INK} strokeWidth="3" />
      {[1, 2].map((c) => (
        <path key={c} d={`M${x + 18 + (134 / 3) * c} 96v96`} stroke={INK} strokeWidth="2" />
      ))}
      {[1, 2, 3].map((r) => (
        <path key={r} d={`M${x + 18} ${116 + 19 * r}h134`} stroke={INK} strokeWidth="2" />
      ))}
    </g>
  );
}

function CalendarArt() {
  return (
    <svg viewBox="0 0 260 200" className="h-auto w-full max-w-[17rem]" role="img" aria-label="A calendar page showing the ambiguous date 03/04/2024">
      <rect x="30" y="30" width="190" height="150" rx="14" fill="#fff" stroke={INK} strokeWidth="5" />
      <path d="M30 70V44a14 14 0 0 1 14-14h162a14 14 0 0 1 14 14v26z" fill="#c6ff3a" stroke={INK} strokeWidth="5" />
      <rect x="70" y="14" width="14" height="34" rx="7" fill="#fff" stroke={INK} strokeWidth="4" />
      <rect x="166" y="14" width="14" height="34" rx="7" fill="#fff" stroke={INK} strokeWidth="4" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={48 + i * 33} y="84" width="22" height="14" rx="3" fill="#d9d5cc" />
      ))}
      <rect x="44" y="108" width="140" height="36" rx="6" fill="#ff7ccf" stroke={INK} strokeWidth="4" />
      <text x="114" y="133" textAnchor="middle" fontFamily="var(--font-jakarta), sans-serif" fontWeight="800" fontSize="20" fill={INK}>
        03/04/2024
      </text>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={48 + i * 33} y="154" width="22" height="12" rx="3" fill="#d9d5cc" />
      ))}
      <circle cx="214" cy="160" r="30" fill="#ff7ccf" stroke={INK} strokeWidth="5" />
      <text x="214" y="173" textAnchor="middle" fontFamily="var(--font-jakarta), sans-serif" fontWeight="800" fontSize="36" fill={INK}>
        ?
      </text>
      <path d="M8 66l14 6M4 92h16M10 40l12 12" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function ChipArt({ before, after }: { before: string; after: string }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[15px]" aria-hidden="true">
      <span className="whitespace-pre rounded-lg border-2 border-ink bg-surface px-3 py-1.5">{before}</span>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12h15M13 6l6 6-6 6" />
      </svg>
      <span className="rounded-lg border-2 border-ink bg-mint-soft px-3 py-1.5">{after}</span>
    </p>
  );
}

function LaptopArt() {
  return (
    <svg viewBox="0 0 200 110" className="h-28 w-auto" aria-hidden="true">
      <rect x="40" y="10" width="120" height="78" rx="6" fill="#fff" stroke={INK} strokeWidth="5" />
      <rect x="50" y="20" width="100" height="58" rx="2" fill="#efffc7" />
      <path d="M100 30 84 36v10c0 9 6.4 15.6 16 18 9.6-2.4 16-9 16-18V36z" fill="#c6ff3a" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 92h156l-8 12H30z" fill="#fff" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    </svg>
  );
}

export default function GuidesIndex() {
  const guides = GUIDES.map(({ slug, title, summary, category }) => ({ slug, title, summary, category }));
  return (
    <>
      <section className="mint-grid overflow-hidden">
        <div className="mx-auto grid max-w-[1400px] items-center gap-8 px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <p className="chip rise">The GridRinse resource hub</p>
            <h1 className="display display-out mt-5 text-[clamp(3rem,12vw,6.4rem)] leading-[0.92] [animation-delay:60ms]">
              Less friction. <br />
              More know-how.
            </h1>
            <p className="rise mt-5 max-w-[38rem] text-[18px] font-semibold leading-snug [animation-delay:120ms] sm:text-[21px]">
              Practical guides for cleaner files, smoother imports, and fewer formatting headaches.
            </p>
          </div>
          <div className="hidden justify-center lg:flex">
            <Art name="bubbles" eager className="float h-auto w-[260px]" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-8 sm:py-12">
        <GuideBrowser
          guides={guides}
          categories={GUIDE_CATEGORIES}
          featured="fix-excel-dates"
          essentials={["csv-cleanup-checklist", "currency-and-number-formats", "browser-privacy"]}
          art={{
            "fix-excel-dates": <CalendarArt />,
            "csv-cleanup-checklist": <ChipArt before="Maria Lopez " after="Maria Lopez" />,
            "currency-and-number-formats": <ChipArt before="$1,234.50" after="1234.50" />,
            "browser-privacy": <LaptopArt />,
          }}
        />

        <section aria-labelledby="uses-heading" className="mt-14">
          <h2 id="uses-heading" className="display text-[clamp(2.4rem,7vw,4rem)]">
            Made for your exports
          </h2>
          <ul className="mt-6 grid gap-6 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <li key={a.slug} className="card-pop lift relative p-5 sm:p-6">
                <p className="text-[16px] font-extrabold text-accent">{a.label}</p>
                <h3 className="mt-2 text-[19px] font-extrabold leading-snug">
                  <Link href={`/for/${a.slug}`} className="decoration-2 underline-offset-4 after:absolute after:inset-0 hover:underline">
                    {a.title}
                  </Link>
                </h3>
              </li>
            ))}
          </ul>
        </section>

        <div className="card-pop mt-16 flex flex-col items-start gap-5 !bg-accent px-6 py-7 !text-white sm:px-8 md:flex-row md:items-center md:justify-between">
          <p className="display display-out text-[2.4rem] sm:text-[3.4rem]">Ready to rinse a file?</p>
          <Link href="/how-it-works" className="btn-pop shrink-0 !bg-mint hover:!bg-pink">
            Try GridRinse free
          </Link>
        </div>
      </div>
    </>
  );
}
