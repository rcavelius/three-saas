import type { Metadata } from "next";
import Link from "next/link";
import { ArticleList, ArticlesByCategory, HelpSearchForm } from "@repo/support/ui";
import { getPlatform } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Help center",
  description: "Answers about WebhookTrail endpoints, inspection, replay, retention, plans, billing, your account and privacy.",
  alternates: { canonical: "/help" },
};

export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const p = await getPlatform();
  const [all, results] = await Promise.all([p.support.listArticles(), q ? p.support.searchArticles(q) : Promise.resolve(null)]);
  return (
    <div className="sup-root mx-auto w-full max-w-[860px] px-4 py-12">
      <p className="label">Help</p>
      <h1 className="mt-2 text-[26px] font-semibold">Help center</h1>
      <p className="mt-2 text-fg-muted">Endpoints, inspection, replay, plans and what to do when a request does not show up.</p>
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
      <p className="mt-10 text-fg-muted">
        Can&apos;t find it?{" "}
        <Link href="/support" className="text-signal underline">
          Ask the assistant or contact a person
        </Link>
        . For the API reference see <Link href="/docs" className="text-signal underline">the docs</Link>.
      </p>
    </div>
  );
}
