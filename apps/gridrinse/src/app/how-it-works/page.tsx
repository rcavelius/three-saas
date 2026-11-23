import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { Cleaner } from "@/components/Cleaner";
import { HowHero } from "@/components/HowHero";
import { freeProcessingLimits, passOffer, upgradeOffers } from "@/server/plans";

export const metadata: Metadata = pageMeta({
  title: "How it works",
  description: "Choose a CSV or Excel file, review every proposed change, and download cleaner data. Your file is processed in your browser and never uploaded.",
  path: "/how-it-works",
});

export default function HowItWorks() {
  return (
    <>
      <HowHero />
      <div className="pt-8 sm:pt-10">
        <Cleaner freeLimits={freeProcessingLimits()} offers={upgradeOffers()} pass={passOffer()} />
      </div>
    </>
  );
}
