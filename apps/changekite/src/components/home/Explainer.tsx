/**
 * The "what it does" graphic: an example site with sticker pins on its problems -> the kite flies over it ->
 * a result card with the score and the fixes. Real HTML and SVG, so every word is crisp text.
 * The problems, score and fix count are the labelled example report's (lib/example-report.ts), so the
 * score shown is what the real scoring function gives for those three problems.
 */
import { EXAMPLE_HOST, EXAMPLE_ISSUES, exampleScore } from "@/lib/example-report";
import { KiteMark } from "@/components/KiteMark";
import { CountUp } from "./CountUp";

const GRADE = { good: "In good order", fair: "Needs attention", poor: "Serious problems" } as const;

// Short sticker labels for the example's three issues, in the same order.
const PIN_LABEL: Record<string, string> = {
  "internal-link-broken": "404 broken link",
  "meta-description-missing": "No description",
  "canonical-missing": "No canonical URL",
};
const SEV_DOT = { critical: "bg-[#ff3b4a]", warning: "bg-[#ffb21a]", notice: "bg-[#6f9bff]" } as const;

function Pin({ label, className, d }: { label: string; className: string; d: number }) {
  return (
    <span className={`ex-pin absolute z-10 flex items-center gap-1.5 ${className}`} style={{ ["--d" as string]: `${d}ms` }}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ff3b4a] text-[0.95rem] font-black text-white shadow-[0_0_0_3px_var(--color-ink)]">!</span>
      <span className="whitespace-nowrap rounded-full bg-[#ff3b4a] px-2.5 py-1 text-[0.8rem] font-extrabold leading-none text-white shadow-[0_0_0_2.5px_var(--color-ink)] sm:text-[0.85rem]">
        {label}
      </span>
    </span>
  );
}

/** The dotted flight path with the kite riding it. Horizontal on wide screens, vertical on phones. */
function Flight() {
  return (
    <div className="relative flex items-center justify-center py-2 lg:py-0" aria-hidden="true">
      <svg viewBox="0 0 200 80" className="ex-path hidden h-20 w-full lg:block" preserveAspectRatio="none">
        <path d="M4 60 C 60 0, 140 90, 196 30" fill="none" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 12" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg viewBox="0 0 80 120" className="ex-path h-28 w-16 lg:hidden">
        <path d="M40 4 C 4 40, 76 70, 40 116" fill="none" stroke="var(--color-ink)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 12" />
      </svg>
      <span className="ex-kite absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <KiteMark className="h-14 w-14 -rotate-12 drop-shadow-[3px_3px_0_var(--color-ink)] sm:h-16 sm:w-16" />
      </span>
      <span className="chip absolute -bottom-1 left-1/2 -translate-x-1/2 lg:bottom-auto lg:top-[calc(50%+34px)]">reads every page</span>
    </div>
  );
}

export function Explainer() {
  const { score, grade } = exampleScore();
  const caption = `How ChangeKite works, shown with an illustrative example site, ${EXAMPLE_HOST}. ChangeKite reads its pages and pins three problems: a broken link that answers 404, a page with no meta description, and no canonical URL. The result is a score of ${score} out of 100, ${GRADE[grade]}, with ${EXAMPLE_ISSUES.length} fixes to make.`;
  return (
    <section aria-labelledby="how-title" className="tile ck-reveal ex col-span-2 bg-green px-5 pb-8 pt-7 sm:px-9 sm:pb-10 sm:pt-9 lg:col-span-12 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="how-title" className="display text-[1.9rem] leading-[1.02] sm:text-[2.75rem]">
          Your site. Our kite. Your fixes.
        </h2>
        <span className="chip">Illustrative example</span>
      </div>

      <figure className="mt-7 lg:mt-9">
        <figcaption className="sr-only">{caption}</figcaption>
        <div aria-hidden="true" className="grid items-center gap-3 lg:grid-cols-[1.25fr_0.6fr_1fr] lg:gap-4">
          {/* An example web page with its problems pinned. */}
          <div className="relative rounded-[24px] bg-white p-3 shadow-[inset_0_0_0_3px_var(--color-ink)] sm:p-4">
            <div className="flex items-center gap-2 px-1 pb-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[0_0_0_2px_var(--color-ink)]" />
              <span className="h-3 w-3 rounded-full bg-yellow shadow-[0_0_0_2px_var(--color-ink)]" />
              <span className="h-3 w-3 rounded-full bg-green shadow-[0_0_0_2px_var(--color-ink)]" />
              <span className="ml-2 truncate rounded-full bg-paper-deep px-3 py-1 text-[0.8rem] font-bold">{EXAMPLE_HOST}</span>
            </div>
            <div className="relative grid min-h-[210px] grid-cols-[1fr_0.9fr] gap-3 rounded-[16px] bg-paper p-4 sm:min-h-[230px]">
              <div className="col-span-2 flex items-center justify-between">
                <span className="h-4 w-24 rounded-full bg-ink/80" />
                <span className="flex gap-2">
                  <span className="h-3 w-10 rounded-full bg-ink/25" />
                  <span className="h-3 w-10 rounded-full bg-ink/25" />
                  <span className="h-3 w-10 rounded-full bg-ink/25" />
                </span>
              </div>
              <div className="space-y-2.5 pt-1">
                <span className="block h-5 w-[85%] rounded-full bg-ink/70" />
                <span className="block h-3 w-full rounded-full bg-ink/20" />
                <span className="block h-3 w-[90%] rounded-full bg-ink/20" />
                <span className="block h-3 w-[70%] rounded-full bg-ink/20" />
                <span className="mt-3 block h-8 w-28 rounded-full bg-pink" />
              </div>
              <div className="rounded-[14px] bg-cyan/70" />
            </div>
            <Pin label={PIN_LABEL[EXAMPLE_ISSUES[0]!.id]!} className="left-[38%] top-[37%] sm:left-[30%]" d={250} />
            <Pin label={PIN_LABEL[EXAMPLE_ISSUES[1]!.id]!} className="right-[4%] top-[58%]" d={450} />
            <Pin label={PIN_LABEL[EXAMPLE_ISSUES[2]!.id]!} className="left-[5%] top-[84%]" d={650} />
          </div>

          <Flight />

          {/* The result. */}
          <div className="relative rounded-[24px] bg-white p-5 shadow-[inset_0_0_0_3px_var(--color-ink)] sm:p-6">
            <div className="flex items-center gap-5">
              <span className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-full bg-yellow shadow-[inset_0_0_0_3px_var(--color-ink)]">
                <CountUp to={score} className="display text-[3.1rem] leading-none" />
              </span>
              <div>
                <p className="text-[0.95rem] font-extrabold">Score out of 100</p>
                <p className="mt-1 inline-flex rounded-full bg-warn-wash px-3 py-1 text-[0.9rem] font-extrabold text-warn">{GRADE[grade]}</p>
              </div>
            </div>
            <p className="display mt-5 text-[1.9rem] leading-none">{EXAMPLE_ISSUES.length} fixes</p>
            <ul className="mt-3 space-y-2">
              {EXAMPLE_ISSUES.map((i, k) => (
                <li key={i.id} className="ex-fix flex items-center gap-2.5 text-[0.95rem] font-bold leading-snug" style={{ ["--d" as string]: `${900 + k * 120}ms` }}>
                  <span className={`h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_2px_var(--color-ink)] ${SEV_DOT[i.severity]}`} />
                  {i.howToFix.split(/[.,;]/)[0]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </figure>
    </section>
  );
}
