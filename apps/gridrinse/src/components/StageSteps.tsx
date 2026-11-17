"use client";

import { useEffect, useState } from "react";
import { CLEANER_EVENTS, type CleanerStage } from "@/lib/cleaner-events";

const STEPS = ["Choose file", "Review changes", "Download"];

/** "1 Choose file — 2 Review changes — 3 Download", lit up as the Cleaner below reports its progress. */
export function StageSteps() {
  const [stage, setStage] = useState<CleanerStage>(1);
  useEffect(() => {
    const on = (e: Event) => setStage((e as CustomEvent<CleanerStage>).detail);
    window.addEventListener(CLEANER_EVENTS.stage, on);
    return () => window.removeEventListener(CLEANER_EVENTS.stage, on);
  }, []);
  return (
    <ol className="mx-auto mt-8 flex max-w-[56rem] items-center justify-center gap-2 sm:gap-4" aria-label="Steps">
      {STEPS.map((label, i) => {
        const n = (i + 1) as CleanerStage;
        const state = n < stage ? "done" : n === stage ? "current" : "todo";
        return (
          <li key={label} className="flex min-w-0 items-center gap-2 sm:gap-4" aria-current={state === "current" ? "step" : undefined}>
            {i > 0 && <span className={`hidden h-0.5 w-10 sm:block md:w-24 ${n <= stage ? "bg-accent" : "bg-rule-strong"}`} aria-hidden="true" />}
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold sm:h-11 sm:w-11 sm:text-[18px] ${
                state === "todo" ? "bg-rule text-ink-3" : "bg-accent text-white"
              }`}
            >
              {state === "done" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-label="done">
                  <path d="m4.5 12.5 5 5 10-11" />
                </svg>
              ) : (
                n
              )}
            </span>
            <span className={`text-[14px] font-extrabold sm:text-[20px] ${state === "todo" ? "font-semibold text-ink-3" : ""}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
