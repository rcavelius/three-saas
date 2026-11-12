import type { Metadata } from "next";
import Link from "next/link";
import { Scanner } from "@/components/Scanner";
import { JsonLd } from "@/components/JsonLd";
import { softwareApplicationJsonLd } from "@/lib/marketing";
import { env } from "@/lib/env";

export const metadata: Metadata = { alternates: { canonical: "/" } };
import { CHECK_DOCS } from "@/lib/check-docs";

function firstSentence(s: string): string {
  const m = /^.*?[.!?](\s|$)/.exec(s);
  return (m ? m[0] : s).trim();
}

export default function HomePage() {
  return (
    <>
      <JsonLd data={softwareApplicationJsonLd(new URL(env().APP_URL).origin)} />
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-20">
        <p className="eyebrow">Free website inspection</p>
        <h1 className="mt-4 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-7xl">
          Find what&rsquo;s broken on your site before your visitors do.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          ChangeKite reads up to 25 of your pages and checks links, titles, descriptions, canonicals, image alt text, your
          sitemap, robots.txt and HTTPS. You get a written report: what is wrong, where, and how to fix it.
        </p>
        <div className="mt-10 max-w-3xl">
          <Scanner />
        </div>
      </section>

      <section aria-labelledby="checks" className="border-t border-rule bg-paper-deep/50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 id="checks" className="font-display text-3xl font-semibold sm:text-4xl">
              The inspection covers
            </h2>
            <Link href="/docs" className="text-accent underline underline-offset-4">
              How each check works
            </Link>
          </div>
          <ol className="mt-8 grid border-t border-ink sm:grid-cols-2 lg:grid-cols-3">
            {CHECK_DOCS.map((c, i) => (
              <li key={c.id} className="border-b border-rule py-5 sm:pr-8">
                <p className="flex items-baseline gap-3">
                  <span className="num text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <Link href={`/docs#${c.id}`} className="font-semibold hover:underline">
                    {c.title}
                  </Link>
                </p>
                <p className="mt-2 pl-8 text-[0.94rem] leading-relaxed text-ink-soft">{firstSentence(c.why)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="limits" className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <h2 id="limits" className="font-display text-3xl font-semibold sm:text-4xl">
          What a free scan is, and isn&rsquo;t
        </h2>
        <div className="space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
          <p>
            A free scan starts at the address you enter and follows links on the same site: 25 pages, three clicks deep, three
            requests at a time with a pause between them. It stops after about 45 seconds. The report always says what was
            not reached, so a clean result is never mistaken for a complete one.
          </p>
          <p>
            It does not run JavaScript, log in, submit forms or measure speed. It reads the HTML your server sends, which is
            also what most search engine crawlers see first.
          </p>
          <p>
            Our crawler identifies itself as <span className="num text-[0.92em]">ChangeKiteBot/1.0</span> and obeys robots.txt.{" "}
            <Link href="/bot" className="text-accent underline underline-offset-4">
              Read about the crawler
            </Link>
            .
          </p>
          <p>
            Looking after several sites? The paid plans re-scan them on a schedule, keep the history and email you only when
            something meaningful changes: the site goes down, a new broken link, a certificate about to expire.{" "}
            <Link href="/pricing" className="text-accent underline underline-offset-4">
              See plans
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
