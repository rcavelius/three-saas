import type { Severity } from "@/lib/scanner/types";
import { EXAMPLE_HOST, EXAMPLE_ISSUES, EXAMPLE_PAGES, EXAMPLE_PASSED, exampleScore } from "@/lib/example-report";
import { ScoreDial } from "@/components/ScoreDial";

export const GRADE_TEXT = {
  good: { label: "In good order", cls: "bg-pass-wash text-pass" },
  fair: { label: "Needs attention", cls: "bg-warn-wash text-warn" },
  poor: { label: "Serious problems", cls: "bg-fail-wash text-fail" },
} as const;

export const SEV: Record<Severity, { label: string; one: string; cls: string; glyph: string }> = {
  critical: { label: "critical", one: "critical", cls: "bg-fail-wash text-fail", glyph: "!" },
  warning: { label: "warnings", one: "warning", cls: "bg-warn-wash text-warn", glyph: "▲" },
  notice: { label: "notices", one: "notice", cls: "bg-notice-wash text-notice", glyph: "i" },
};

export function SevGlyph({ s, className = "" }: { s: Severity; className?: string }) {
  return (
    <span aria-hidden="true" className={`num inline-grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.7rem] font-extrabold ${SEV[s].cls} ${className}`}>
      {SEV[s].glyph}
    </span>
  );
}

function Tick() {
  return (
    <span aria-hidden="true" className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pass-wash text-pass">
      <svg viewBox="0 0 12 12" className="h-3 w-3">
        <path d="M2.5 6.2 5 8.6l4.6-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * The hero's product visual: the report UI filled with clearly labelled example data.
 * Score and grade come from the real scoring function (lib/example-report.ts).
 */
export function ExampleReport() {
  const { score, grade, counts } = exampleScore();
  const g = GRADE_TEXT[grade];
  return (
    <figure
      className="card ck-in relative overflow-hidden !rounded-[20px] bg-white shadow-[0_16px_48px_rgba(23,26,37,0.07),0_0_0_1px_var(--color-rule)]"
      style={{ ["--d" as string]: "120ms" }}
      aria-label={`Example report for ${EXAMPLE_HOST} (illustrative data): score ${score} out of 100, ${g.label}`}
    >
      {/* One slow scan-line pass over the card on load: the report being read. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[10%] overflow-hidden">
        <div className="ck-sweep h-full w-full bg-accent/[0.06]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-[18px] py-3.5 sm:px-7 sm:py-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold tracking-[-0.02em] text-ink">{EXAMPLE_HOST}</p>
          <p className="text-[0.8rem] font-medium text-muted">
            <span className="font-bold text-accent sm:hidden">Example report · illustrative data · </span>
            <span className="hidden sm:inline">Illustrative result · </span>
            {EXAMPLE_PAGES} example pages
          </p>
        </div>
        <span className="hidden rounded-full bg-accent-wash px-3 py-1 text-[0.75rem] font-bold text-accent sm:inline">Example report · illustrative data</span>
      </div>

      <div className="grid gap-5 px-[18px] py-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-7 sm:px-7 sm:py-6">
        <div className="hidden sm:block">
          <ScoreDial score={score} grade={grade} size={120} />
        </div>
        <div className="flex items-center gap-4 sm:block">
          <div className="sm:hidden">
            <ScoreDial score={score} grade={grade} size={80} />
          </div>
          <div>
            <p className={`inline-flex rounded-full px-3 py-1 text-[0.8rem] font-bold ${g.cls}`}>{g.label}</p>
            <p className="mt-2 text-[0.95rem] leading-snug text-ink-soft">
              One broken link needs fixing. Two other issues were found.
            </p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 px-[18px] sm:px-7">
        {(["critical", "warning", "notice"] as const).map((s, i) => (
          <div key={s} className={`ck-pop flex h-[38px] items-center gap-2 rounded-lg px-3 ${SEV[s].cls}`} style={{ ["--d" as string]: `${700 + i * 60}ms` }}>
            <dt className="text-[0.8rem] font-semibold">{counts[s] === 1 ? SEV[s].one : SEV[s].label}</dt>
            <dd className="num order-first text-lg font-extrabold leading-none">{counts[s]}</dd>
          </div>
        ))}
      </dl>

      <div className="px-[18px] pb-2 pt-5 sm:px-7">
        <p className="text-[0.8rem] font-bold text-muted">Findings <span className="font-medium">· open one to see the fix</span></p>
        <ul className="mt-1">
          {EXAMPLE_ISSUES.map((issue, i) => (
            <li key={issue.id} className="ck-in border-b border-rule last:border-b-0" style={{ ["--d" as string]: `${900 + i * 60}ms` }}>
              <details className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
                  <SevGlyph s={issue.severity} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold leading-snug text-ink">{issue.message}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-[1.45] text-muted">{issue.detail}</span>
                  </span>
                  <span aria-hidden="true" className="mt-1 text-muted transition-transform duration-200 group-open:rotate-90">
                    →
                  </span>
                </summary>
                <p className="mb-4 ml-9 rounded-lg bg-paper px-3 py-2.5 text-[13.5px] leading-[1.5] text-ink-soft">
                  <strong className="text-ink">How to fix: </strong>
                  {issue.howToFix}
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 bg-paper/70 px-[18px] py-4 sm:px-7">
        {EXAMPLE_PASSED.map((p, i) => (
          <li key={p} className="ck-in flex items-center gap-2 text-[0.85rem] font-semibold text-ink-soft" style={{ ["--d" as string]: `${1100 + i * 60}ms` }}>
            <Tick />
            {p}
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">Illustrative example only, not a real customer&rsquo;s site.</figcaption>
    </figure>
  );
}
