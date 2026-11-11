import type { Metadata } from "next";
import Link from "next/link";
import { ArticleList, ArticlesByCategory, HelpSearchForm } from "@repo/support/ui";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Help center",
  description: "Answers about cleaning files with DataPolish, file formats and limits, workflows, plans, billing, your account and privacy.",
  alternates: { canonical: "/help" },
};

export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const p = await getPlatform();
  const [all, results] = await Promise.all([p.support.listArticles(), q ? p.support.searchArticles(q) : Promise.resolve(null)]);
  return (
    <div className="sup-root mx-auto max-w-[900px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Help</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Help center</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">How the cleaner works, what each plan includes, and what to do when a file will not behave.</p>
      <div className="mt-6">
        <HelpSearchForm q={q} />
      </div>
      <div className="mt-6">
        {results ? (
          <section aria-labelledby="results">
            <h2 id="results" className="sup-h2">
              {results.length ? `Results for “${q}”` : `Nothing found for “${q}”`}
            </h2>
            <ArticleList articles={results} empty="Try other words, or ask the assistant on the support page." />
          </section>
        ) : (
          <ArticlesByCategory articles={all} />
        )}
      </div>
      <p className="mt-10 text-ink-2">
        Can&apos;t find it?{" "}
        <Link href="/support" className="text-accent underline">
          Ask the assistant or contact a person
        </Link>
        .
      </p>
    </div>
  );
}
