"use client";

import { useState } from "react";
import type { Severity } from "@/lib/scanner/types";
import { SCORE_RULES, scoreFromCounts } from "@/lib/scanner/score";
import { ScoreDial } from "@/components/ScoreDial";

const GRADE = {
  good: { label: "In good order", cls: "bg-pass-wash text-pass" },
  fair: { label: "Needs attention", cls: "bg-warn-wash text-warn" },
  poor: { label: "Serious problems", cls: "bg-fail-wash text-fail" },
} as const;

const ROWS: { s: Severity; name: string; plural: string; cls: string; what: string }[] = [
  { s: "critical", name: "Critical", plural: "critical", cls: "text-fail", what: "Visitors or search engines hit a wall: the start page fails, a link is broken, the certificate is expiring." },
  { s: "warning", name: "Warning", plural: "warnings", cls: "text-warn", what: "Something costs you clicks or trust: a missing description, a duplicate title, http not redirected." },
  { s: "notice", name: "Notice", plural: "notices", cls: "text-notice", what: "Worth tidying when you can: no canonical declared, a chain of redirects, a short HSTS max-age." },
];

/**
 * The page's one live thing: set the counts, read the score and grade from the scanner's real scoring function.
 * Starts on the hero's example (1 / 1 / 1). Without JavaScript the static example is still a correct reading.
 */
export function ScoreLab({ initial }: { initial: Record<Severity, number> }) {
  const [counts, setCounts] = useState(initial);
  const { score, grade } = scoreFromCounts(counts);
  const g = GRADE[grade];
  const set = (s: Severity, d: number) => setCounts((c) => ({ ...c, [s]: Math.max(0, Math.min(20, c[s] + d)) }));

  return (
    <div className="grid overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_var(--color-rule),0_16px_48px_rgba(23,26,37,0.06)] lg:grid-cols-[42fr_58fr]">
      <div className="flex flex-col items-center justify-center gap-5 border-b border-rule bg-paper/50 px-5 py-8 text-center sm:px-10 sm:py-10 lg:border-b-0 lg:border-r">
        <div className="sm:hidden">
          <ScoreDial score={score} grade={grade} size={124} animate={false} label={`Score ${score} out of 100, ${g.label}`} />
        </div>
        <div className="hidden sm:block">
          <ScoreDial score={score} grade={grade} size={160} animate={false} label={`Score ${score} out of 100, ${g.label}`} />
        </div>
        <p aria-live="polite" className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${g.cls}`}>
          {g.label}
        </p>
        <p className="num text-base font-bold text-ink-soft">
          100 − {Math.min(SCORE_RULES.critical.cap, counts.critical * SCORE_RULES.critical.points)} −{" "}
          {Math.min(SCORE_RULES.warning.cap, counts.warning * SCORE_RULES.warning.points)} −{" "}
          {Math.min(SCORE_RULES.notice.cap, counts.notice * SCORE_RULES.notice.points)} = <span className="text-ink">{score}</span>
        </p>
      </div>

      <div className="px-5 py-2 sm:px-10 sm:py-4">
        <div className="flex items-center justify-between gap-4 pt-4">
          <p className="text-xs font-extrabold tracking-[0.06em] text-accent">Try the scoring formula</p>
          <button
            type="button"
            onClick={() => setCounts(initial)}
            disabled={counts.critical === initial.critical && counts.warning === initial.warning && counts.notice === initial.notice}
            className="min-h-11 rounded-lg px-2 text-[13px] font-bold text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-40 disabled:hover:no-underline"
          >
            Reset example
          </button>
        </div>
        <ul>
          {ROWS.map((r) => {
            const rule = SCORE_RULES[r.s];
            return (
              <li key={r.s} className="grid min-h-[76px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-rule py-5 last:border-b-0">
                <div>
                  <p className="text-lg font-extrabold tracking-[-0.02em]">
                    <span className={r.cls}>{r.name}</span>{" "}
                    <span className="text-[0.9rem] font-semibold text-muted">
                      −{rule.points} each, at most −{rule.cap}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{r.what}</p>
                </div>
                <div className="flex items-center gap-1" role="group" aria-label={`${r.name} issues`}>
                  <button
                    type="button"
                    onClick={() => set(r.s, -1)}
                    disabled={counts[r.s] === 0}
                    aria-label={`One fewer ${r.name.toLowerCase()} issue`}
                    className="grid h-11 w-11 place-items-center rounded-xl bg-paper-deep text-xl font-bold text-ink transition-transform hover:bg-rule active:scale-95 disabled:opacity-40"
                  >
                    −
                  </button>
                  <output className="num w-9 text-center text-2xl font-extrabold" aria-label={`${counts[r.s]} ${r.plural}`}>
                    {counts[r.s]}
                  </output>
                  <button
                    type="button"
                    onClick={() => set(r.s, 1)}
                    disabled={counts[r.s] === 20}
                    aria-label={`One more ${r.name.toLowerCase()} issue`}
                    className="grid h-11 w-11 place-items-center rounded-xl bg-paper-deep text-xl font-bold text-ink transition-transform hover:bg-rule active:scale-95 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-rule py-5 text-[0.95rem] leading-relaxed text-ink-soft">
          {counts.critical + counts.warning + counts.notice === 0
            ? "No issues: the score stays at 100."
            : `${counts.critical} critical, ${counts.warning} warning${counts.warning === 1 ? "" : "s"} and ${counts.notice} notice${counts.notice === 1 ? "" : "s"} score ${score}.`}{" "}
          A site with any critical issue cannot be graded &ldquo;in good order&rdquo;, whatever its score, and each kind of deduction is capped so one
          noisy problem cannot hide everything else. This only changes the formula, not the example report above.
        </p>
      </div>
    </div>
  );
}
