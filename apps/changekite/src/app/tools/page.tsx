import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { TOOLS } from "@/content/tools";

export const metadata: Metadata = {
  title: "Free website checkers: broken links, sitemap, robots.txt, SSL",
  description:
    "Free checkers for broken links, 404 pages, redirect chains, mixed content, canonical tags, sitemaps, robots.txt, SSL certificates, titles and alt text, plus monitoring.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndex() {
  const free = TOOLS.filter((t) => !t.paid);
  const paid = TOOLS.filter((t) => t.paid);
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle
        eyebrow="Tools"
        title="Website checkers"
        lede="Each checker is the same free ChangeKite scan, explained for one job. One scan runs every check, so you only need to scan once."
      />
      <h2 className="mt-12 font-display text-2xl font-semibold">Free checks</h2>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {free.map((t) => (
          <li key={t.slug} className="py-6">
            <h3 className="font-display text-xl font-semibold">
              <Link href={`/tools/${t.slug}`} className="hover:underline">
                {t.h1}
              </Link>
            </h3>
            <p className="mt-2 text-ink-soft">{t.description}</p>
          </li>
        ))}
      </ul>
      <h2 className="mt-12 font-display text-2xl font-semibold">Monitoring (paid plans)</h2>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {paid.map((t) => (
          <li key={t.slug} className="py-6">
            <h3 className="font-display text-xl font-semibold">
              <Link href={`/tools/${t.slug}`} className="hover:underline">
                {t.h1}
              </Link>
            </h3>
            <p className="mt-2 text-ink-soft">{t.description}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-ink-soft">
        For exactly how each check works and how the score is calculated, see{" "}
        <Link className="text-accent underline" href="/docs">
          what we check
        </Link>
        .
      </p>
    </div>
  );
}
