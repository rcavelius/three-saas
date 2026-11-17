"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

export interface GuideCard {
  slug: string;
  title: string;
  summary: string;
  category: string;
}

function ReadGuide({ slug, title }: { slug: string; title: string }) {
  return (
    <Link href={`/guides/${slug}`} className="mt-auto inline-flex w-fit items-center gap-2 pt-3 text-[17px] font-extrabold underline decoration-2 underline-offset-4" aria-label={`Read guide: ${title}`}>
      Read guide
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12h15M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

/** Resource hub: search box and category chips over the guides, a featured guide and the essentials. */
export function GuideBrowser({
  guides,
  categories,
  featured,
  essentials,
  art,
}: {
  guides: GuideCard[];
  categories: { id: string; label: string }[];
  featured: string;
  essentials: string[];
  art: Record<string, ReactNode>;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? "";
  const filtering = q.trim() !== "" || cat !== null;
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return guides.filter((g) => (!cat || g.category === cat) && words.every((w) => `${g.title} ${g.summary}`.toLowerCase().includes(w)));
  }, [guides, q, cat]);
  const bySlug = (s: string) => guides.find((g) => g.slug === s)!;
  const feat = bySlug(featured);
  const rest = guides.filter((g) => g.slug !== featured && !essentials.includes(g.slug));
  const tints = ["bg-lemon-soft", "bg-mint-soft", "bg-sky-soft"];

  const chip = (id: string | null, label: string) => (
    <button
      key={label}
      type="button"
      aria-pressed={cat === id}
      onClick={() => setCat(id)}
      className={`rounded-[10px] border-2 border-ink px-4 py-2 text-[16px] font-extrabold whitespace-nowrap ${cat === id ? "bg-accent text-white" : "bg-surface hover:bg-lemon-soft"}`}
    >
      {label}
    </button>
  );

  const list = (items: GuideCard[]) => (
    <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {items.map((g) => (
        <li key={g.slug} className="card-pop flex flex-col p-5 sm:p-6">
          <p className="w-fit rounded-md bg-lemon px-2.5 py-0.5 text-[13px] font-extrabold uppercase tracking-[0.03em]">{catLabel(g.category)}</p>
          <h3 className="mt-3 text-[21px] font-extrabold leading-snug tracking-[-0.01em]">{g.title}</h3>
          <p className="mt-1.5 text-[16px] font-medium leading-snug text-ink-2">{g.summary}</p>
          <ReadGuide slug={g.slug} title={g.title} />
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <label className="relative flex-1 lg:max-w-[34rem]">
          <span className="sr-only">Search guides</span>
          <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guides…"
            className="h-12 w-full rounded-[10px] border-2 border-ink bg-surface pl-12 pr-4 text-[17px] font-medium placeholder:text-ink-3"
          />
        </label>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:ml-auto lg:px-0">
          {chip(null, "All resources")}
          {categories.map((c) => chip(c.id, c.label))}
        </div>
      </div>

      {filtering ? (
        <section aria-live="polite" className="mt-8">
          <h2 className="sr-only">Matching guides</h2>
          {results.length ? (
            list(results)
          ) : (
            <p className="text-[18px] font-medium">
              No guide matches that yet. Try the{" "}
              <Link href={`/help?q=${encodeURIComponent(q)}`} className="font-bold underline decoration-2 underline-offset-4">
                help center
              </Link>
              .
            </p>
          )}
        </section>
      ) : (
        <>
          <article className="card-pop mt-8 grid overflow-hidden md:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]">
            <div className="flex items-center justify-center border-b-2 border-ink bg-mint-soft p-6 md:border-b-0 md:border-r-2">{art[feat.slug]}</div>
            <div className="flex flex-col p-6 sm:p-8">
              <p className="w-fit rounded-md bg-lemon px-3 py-1 text-[14px] font-extrabold uppercase tracking-[0.03em]">{catLabel(feat.category)}</p>
              <h2 className="display mt-3 text-[2rem] sm:text-[2.6rem]">{feat.title}</h2>
              <p className="mt-3 text-[18px] font-medium leading-snug">{feat.summary}</p>
              <ReadGuide slug={feat.slug} title={feat.title} />
            </div>
          </article>

          <section aria-labelledby="essentials" className="mt-12">
            <h2 id="essentials" className="display text-[2rem] sm:text-[2.6rem]">
              Start with the essentials
            </h2>
            <ul className="mt-6 grid gap-6 md:grid-cols-3">
              {essentials.map(bySlug).map((g, i) => (
                <li key={g.slug} className="flex flex-col overflow-hidden rounded-[10px] border-2 border-ink bg-surface">
                  <div className={`flex h-36 items-center justify-center border-b-2 border-ink px-4 ${tints[i % tints.length]}`}>{art[g.slug]}</div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-[21px] font-extrabold leading-snug tracking-[-0.01em]">{g.title}</h3>
                    <p className="mt-1.5 text-[16px] font-medium leading-snug text-ink-2">{g.summary}</p>
                    <ReadGuide slug={g.slug} title={g.title} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="more-guides" className="mt-12">
            <h2 id="more-guides" className="display text-[2rem] sm:text-[2.6rem]">
              More guides
            </h2>
            <div className="mt-6">{list(rest)}</div>
          </section>
        </>
      )}
    </div>
  );
}
