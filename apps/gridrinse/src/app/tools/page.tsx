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
      <PageHero eyebrow="Free · no upload · no account" title="Free CSV and Excel cleanup tools">
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">
          Each tool is the same cleaner, set up for one job. Your file is processed in your browser and never uploaded.
        </p>
      </PageHero>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.slug}>
              <Link href={`/tools/${t.slug}`} className="card-pop block h-full px-5 py-4 hover:bg-lemon-soft">
                <h2 className="text-[19px] font-extrabold">{t.h1}</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{t.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
