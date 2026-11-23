import type { Metadata } from "next";
import Link from "next/link";
import { SkyHero } from "@/components/ui";
import { TOOLS } from "@/content/tools";

export const metadata: Metadata = {
  title: "Free website checkers: broken links, sitemap, robots.txt, SSL",
  description:
    "Free checkers for broken links, 404 pages, redirect chains, mixed content, canonical tags, sitemaps, robots.txt, SSL certificates, titles and alt text, plus monitoring.",
  alternates: { canonical: "/tools" },
};

function ToolRow({ slug, h1, description, i }: { slug: string; h1: string; description: string; i: number }) {
  return (
    <li className="ck-reveal" style={{ ["--d" as string]: `${(i % 6) * 50}ms` }}>
      <Link href={`/tools/${slug}`} className="group -mx-4 grid gap-x-10 gap-y-1.5 rounded-2xl px-4 py-5 transition-colors hover:bg-sky-pale md:grid-cols-[1fr_1fr_auto] md:items-center">
        <h3 className="font-display text-[1.5rem] leading-tight sm:text-[1.875rem]">{h1}</h3>
        <p className="text-[1.0625rem] leading-relaxed text-ink-soft">{description}</p>
        <span aria-hidden="true" className="hidden h-11 w-11 place-items-center rounded-full bg-paper text-xl transition-transform group-hover:translate-x-1 group-hover:bg-white md:grid">
          →
        </span>
      </Link>
    </li>
  );
}

export default function ToolsIndex() {
  const free = TOOLS.filter((t) => !t.paid);
  const paid = TOOLS.filter((t) => t.paid);
  return (
    <>
      <SkyHero
        title="Website checkers"
        lede="Each checker is the same free scan, explained for one job. One scan runs every check, so you only need to scan once."
      />
      <div className="mx-auto max-w-[1360px] px-5 md:px-8 lg:px-12">
        <section aria-labelledby="free" className="pt-20 lg:pt-28">
          <h2 id="free" className="display text-[2.25rem] sm:text-[3rem]">
            Free checks
          </h2>
          <ul className="mt-8">
            {free.map((t, i) => (
              <ToolRow key={t.slug} {...t} i={i} />
            ))}
          </ul>
        </section>
        <section aria-labelledby="paid" className="mt-20 rounded-[32px] bg-ink px-5 py-12 text-white sm:px-10 lg:mt-28 lg:py-16">
          <h2 id="paid" className="display text-[2.25rem] sm:text-[3rem]">
            Monitoring
          </h2>
          <p className="mt-3 text-lg text-white/85">On the paid plans: scheduled re-scans and an email when something changes.</p>
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {paid.map((t) => (
              <li key={t.slug}>
                <Link href={`/tools/${t.slug}`} className="ck-lift flex h-full flex-col gap-3 rounded-[22px] bg-white/10 p-6 transition-colors hover:bg-white/15">
                  <h3 className="font-display text-[1.5rem] leading-tight">{t.h1}</h3>
                  <p className="text-[1.0625rem] leading-relaxed text-white/85">{t.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <p className="mt-12 text-lg text-ink-soft">
          Exactly how each check works and how the score is calculated:{" "}
          <Link className="font-bold text-accent underline" href="/docs">
            what we check
          </Link>
          .
        </p>
      </div>
    </>
  );
}
