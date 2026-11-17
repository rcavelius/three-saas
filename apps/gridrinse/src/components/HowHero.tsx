"use client";

import { useEffect, useState } from "react";
import { StageSteps } from "@/components/StageSteps";
import { CLEANER_EVENTS, type CleanerStage } from "@/lib/cleaner-events";

/** The How it works intro. Once a file is loaded the workspace has its own progress bar, so the intro folds away. */
export function HowHero() {
  const [stage, setStage] = useState<CleanerStage>(1);
  useEffect(() => {
    const on = (e: Event) => setStage((e as CustomEvent<CleanerStage>).detail);
    window.addEventListener(CLEANER_EVENTS.stage, on);
    return () => window.removeEventListener(CLEANER_EVENTS.stage, on);
  }, []);
  if (stage > 1) return <h1 className="sr-only">Clean up your spreadsheet</h1>;
  return (
    <section className="border-b-2 border-ink bg-[linear-gradient(to_bottom,var(--color-mint-soft),var(--color-paper))]">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-10 text-center sm:px-8 sm:pt-14">
        <h1 className="display text-[2.5rem] sm:text-[3.6rem] lg:text-[4.2rem]">Let&rsquo;s clean up your spreadsheet.</h1>
        <p className="mx-auto mt-4 max-w-[44rem] text-[18px] font-medium sm:text-[22px]">Choose your file. Review the changes. Download cleaner data.</p>
        <StageSteps />
      </div>
    </section>
  );
}
