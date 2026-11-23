import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { ArticleList, ArticlesByCategory, HelpSearchForm } from "@repo/support/ui";
import { PageHero } from "@/components/PageHero";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({
  title: "Help center",
  description: "Answers about cleaning files with GridRinse, file formats and limits, workflows, plans, billing, your account and privacy.",
  path: "/help",
});

export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const p = await getPlatform();
  const [all, results] = await Promise.all([p.support.listArticles(), q ? p.support.searchArticles(q) : Promise.resolve(null)]);
  return (
    <div className="sup-root">
      <PageHero eyebrow="Features & help" title="Everything GridRinse can do.">
        How the cleaner works, what each plan includes, and what to do when a file will not behave.
      </PageHero>
      <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="card-pop bg-lemon-soft p-5 sm:p-6">
        <HelpSearchForm q={q} />
      </div>
      <div className="mt-4">
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
      <p className="mt-12 text-[17px] font-medium">
        Can&apos;t find it?{" "}
        <Link href="/support" className="font-bold">
          Ask the assistant or contact a person
        </Link>
        .
      </p>
      </div>
    </div>
  );
}
