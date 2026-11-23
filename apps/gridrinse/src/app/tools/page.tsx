import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { TOOLS } from "@/content/tools";

export const metadata: Metadata = pageMeta({
  title: "Free CSV and Excel cleanup tools",
  description: "Free browser tools to remove duplicates and blank rows, trim spaces, fix dates, clean numbers and merge CSV or Excel files. No upload, no account.",
  path: "/tools",
});

export default function ToolsIndex() {
  return (
    <article>
      <PageHero eyebrow="Free · no upload · no account" title="Free CSV and Excel cleanup tools" art="bubbles">
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">
          Each tool is the same cleaner, set up for one job. Your file is processed in your browser and never uploaded.
        </p>
      </PageHero>
      <div className="mx-auto max-w-[1400px] px-4 py-14 sm:px-8 sm:py-20">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t, i) => (
            <li key={t.slug}>
              <Link href={`/tools/${t.slug}`} className={`card-pop lift flex h-full flex-col gap-2 px-5 py-5 sm:px-6 ${["bg-mint", "bg-surface", "bg-pink", "bg-surface"][i % 4]}`}>
                <h2 className="display text-[2rem] leading-[0.95]">{t.h1}</h2>
                <p className="text-[16px] font-medium leading-snug">{t.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
