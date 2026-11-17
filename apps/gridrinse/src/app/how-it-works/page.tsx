import type { Metadata } from "next";
import { Cleaner } from "@/components/Cleaner";
import { StageSteps } from "@/components/StageSteps";
import { freeProcessingLimits } from "@/server/plans";

export const metadata: Metadata = {
  title: "How it works",
  description: "Choose a CSV or Excel file, review every proposed change, and download cleaner data. Your file is processed in your browser and never uploaded.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorks() {
  return (
    <>
      <section className="border-b-2 border-ink bg-[linear-gradient(to_bottom,var(--color-mint-soft),var(--color-paper))]">
        <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-10 text-center sm:px-8 sm:pt-14">
          <h1 className="display text-[2.5rem] sm:text-[3.6rem] lg:text-[4.2rem]">Let&rsquo;s clean up your spreadsheet.</h1>
          <p className="mx-auto mt-4 max-w-[44rem] text-[18px] font-medium sm:text-[22px]">Choose your file. Review the changes. Download cleaner data.</p>
          <StageSteps />
        </div>
      </section>
      <div className="pt-8 sm:pt-10">
        <Cleaner freeLimits={freeProcessingLimits()} />
      </div>
    </>
  );
}
