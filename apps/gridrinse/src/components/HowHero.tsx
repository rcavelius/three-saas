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
    <section className="mint-grid">
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-10 text-center sm:px-8 sm:pt-14">
        <h1 className="display display-out rise text-[clamp(3rem,12vw,6.4rem)] leading-[0.92]">Let&rsquo;s rinse your spreadsheet.</h1>
        <p className="rise mx-auto mt-4 max-w-[44rem] text-[18px] font-semibold [animation-delay:80ms] sm:text-[22px]">Choose your file. Review the changes. Download cleaner data.</p>
        <StageSteps />
      </div>
    </section>
  );
}
