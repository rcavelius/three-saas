import type { Metadata } from "next";
import Link from "next/link";
import { ArticleList, ArticlesByCategory, HelpSearchForm } from "@repo/support/ui";
import { PageTitle } from "@/components/ui";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Help center",
  description: "Answers about ChangeKite scans, monitoring, plans, billing, your account and privacy.",
  alternates: { canonical: "/help" },
};

export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const p = await getPlatform();
  const [all, results] = await Promise.all([p.support.listArticles(), q ? p.support.searchArticles(q) : Promise.resolve(null)]);
  return (
    <div className="sup-root mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle eyebrow="Help" title="Help center" lede="How ChangeKite works, what the plans include, and what to do when something goes wrong." />
      <div className="mt-8">
        <HelpSearchForm q={q} />
      </div>
      <div className="mt-8">
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
      <p className="mt-12 text-ink-soft">
        Can&apos;t find it? <Link href="/support" className="text-accent underline">Ask the assistant or contact a person</Link>.
      </p>
    </div>
  );
}
