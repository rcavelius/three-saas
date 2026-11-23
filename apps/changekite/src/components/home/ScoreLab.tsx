"use client";

import { useState } from "react";
import type { Severity } from "@/lib/scanner/types";
import { SCORE_RULES, scoreFromCounts } from "@/lib/scanner/score";

const GRADE = {
  good: { label: "In good order", cls: "bg-pass-wash text-pass" },
  fair: { label: "Needs attention", cls: "bg-warn-wash text-warn" },
  poor: { label: "Serious problems", cls: "bg-fail-wash text-fail" },
} as const;

const ROWS: { s: Severity; name: string; plural: string; bow: string }[] = [
  { s: "critical", name: "Critical", plural: "critical", bow: "var(--color-bow-fail)" },
  { s: "warning", name: "Warnings", plural: "warnings", bow: "var(--color-bow-warn)" },
  { s: "notice", name: "Notices", plural: "notices", bow: "var(--color-bow-notice)" },
];

function Bow({ fill }: { fill: string }) {
  return (
    <svg viewBox="-20 -15 40 30" className="h-6 w-8 shrink-0" aria-hidden="true">
      <path d="M0 0 L-17 -13 L-17 13 Z M0 0 L17 -13 L17 13 Z" fill={fill} />
      <circle r="4" fill="var(--color-ink)" />
    </svg>
  );
}

/**
 * The page's one live thing: change the counts and the big score and grade follow the scanner's real
 * scoring function. Starts on the example report's counts. Without JavaScript the example reading is still correct.
 */
export function ScoreLab({ initial }: { initial: Record<Severity, number> }) {
  const [counts, setCounts] = useState(initial);
  const { score, grade } = scoreFromCounts(counts);
  const g = GRADE[grade];
  const set = (s: Severity, d: number) => setCounts((c) => ({ ...c, [s]: Math.max(0, Math.min(20, c[s] + d)) }));
  const changed = counts.critical !== initial.critical || counts.warning !== initial.warning || counts.notice !== initial.notice;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <p className="display display-xl num text-[9rem] !leading-[0.8] tracking-[-0.04em] sm:text-[13rem] lg:text-[15rem]" aria-live="polite" aria-atomic="true">
          <span className="sr-only">Score </span>
          {score}
          <span className="sr-only"> out of 100, {g.label}</span>
        </p>
        <div className="pb-3">
          <p className="text-lg font-bold text-ink-soft">out of 100</p>
          <p className={`mt-2 inline-flex rounded-full px-3.5 py-1.5 text-[0.95rem] font-bold ${g.cls}`}>{g.label}</p>
        </div>
      </div>

      <ul className="mt-8 grid gap-2">
        {ROWS.map((r) => {
          const rule = SCORE_RULES[r.s];
          return (
            <li key={r.s} className="flex items-center gap-4 rounded-2xl bg-paper px-4 py-3 sm:px-5">
              <Bow fill={r.bow} />
              <p className="min-w-0 flex-1">
                <span className="block text-[1.0625rem] font-extrabold">{r.name}</span>
                <span className="block text-[0.95rem] text-muted">
                  −{rule.points} each, at most −{rule.cap}
                </span>
              </p>
              <div className="flex items-center gap-1" role="group" aria-label={`${r.name} issues`}>
                <button
                  type="button"
                  onClick={() => set(r.s, -1)}
                  disabled={counts[r.s] === 0}
                  aria-label={`One fewer ${r.name.toLowerCase()} issue`}
                  className="grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-bold text-ink transition-transform hover:bg-sky-pale active:scale-90 disabled:opacity-40"
                >
                  −
                </button>
                <output className="num w-10 text-center text-2xl font-extrabold" aria-label={`${counts[r.s]} ${r.plural}`}>
                  {counts[r.s]}
                </output>
                <button
                  type="button"
                  onClick={() => set(r.s, 1)}
                  disabled={counts[r.s] === 20}
                  aria-label={`One more ${r.name.toLowerCase()} issue`}
                  className="grid h-11 w-11 place-items-center rounded-full bg-white text-xl font-bold text-ink transition-transform hover:bg-sky-pale active:scale-90 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.95rem] text-muted">
        <span>Any critical issue rules out &ldquo;in good order&rdquo;.</span>
        <button
          type="button"
          onClick={() => setCounts(initial)}
          disabled={!changed}
          className="min-h-11 font-bold text-accent underline-offset-4 hover:underline disabled:invisible"
        >
          Back to the example
        </button>
      </p>
    </div>
  );
}
