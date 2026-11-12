import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Guides",
  description: "Short, practical guides to the website problems ChangeKite finds: broken links, expiring certificates and robots.txt mistakes.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle eyebrow="Guides" title="Fixing what the report finds" lede="Short, practical write-ups of the problems that hurt sites most often." />
      <ul className="mt-10 divide-y divide-rule border-y border-rule">
        {GUIDES.map((g) => (
          <li key={g.slug} className="py-6">
            <h2 className="font-display text-2xl font-semibold">
              <Link href={`/guides/${g.slug}`} className="hover:underline">
                {g.title}
              </Link>
            </h2>
            <p className="mt-2 text-ink-soft">{g.description}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-ink-soft">
        For what each check measures and how the score works, see <Link className="text-accent underline" href="/docs">what we check</Link>.
      </p>
    </div>
  );
}
