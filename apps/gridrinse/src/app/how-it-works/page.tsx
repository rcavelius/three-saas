import type { Metadata } from "next";
import { Cleaner } from "@/components/Cleaner";
import { HowHero } from "@/components/HowHero";
import { freeProcessingLimits } from "@/server/plans";

export const metadata: Metadata = {
  title: "How it works",
  description: "Choose a CSV or Excel file, review every proposed change, and download cleaner data. Your file is processed in your browser and never uploaded.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorks() {
  return (
    <>
      <HowHero />
      <div className="pt-8 sm:pt-10">
        <Cleaner freeLimits={freeProcessingLimits()} />
      </div>
    </>
  );
}
