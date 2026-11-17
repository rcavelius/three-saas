import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cleaner } from "@/components/Cleaner";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { TOOLS, getTool, toolExample } from "@/content/tools";
import { appUrl } from "@/lib/site";
import { freeProcessingLimits } from "@/server/plans";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getTool(slug);
  if (!t) return {};
  return {
    title: { absolute: `${t.title} · GridRinse` },
    description: t.description,
    alternates: { canonical: `/tools/${t.slug}` },
    openGraph: { type: "website", title: t.h1, description: t.description },
  };
}

function Table({ table, label }: { table: { columns: string[]; rows: string[][] }; label: "Before" | "After" }) {
  return (
    <div className="card-pop overflow-hidden">
      <p className={`border-b-2 border-ink px-4 py-2 text-[15px] font-extrabold ${label === "After" ? "bg-mint-soft" : "bg-lemon-soft"}`}>{label}</p>
      <div className="overflow-x-auto p-2.5">
        <table className="w-full border-collapse bg-surface font-mono text-[12.5px]">
          <thead>
            <tr>
              {table.columns.map((h) => (
                <th key={h} scope="col" className="border border-rule bg-sunken px-2 py-1 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="whitespace-pre border border-rule px-2 py-1">
                    {c === "" ? " " : c.replace(/ /g, "·").replace(/​/g, "␣")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTool(slug);
  if (!t) notFound();
  const ex = toolExample(t);
  const others = TOOLS.filter((o) => o.slug !== t.slug);
  const base = appUrl();

  return (
    <article>
      <PageHero eyebrow="Free tool · no upload · no account" title={t.h1}>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">{t.intro}</p>
      </PageHero>

      <div className="pt-8 sm:pt-10">
        <Cleaner freeLimits={freeProcessingLimits()} />
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <section aria-labelledby="howto" className="mt-14">
          <h2 id="howto" className="display text-[1.9rem] sm:text-[2.3rem]">
            How to do it
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-6 text-[16px] leading-relaxed">
            {t.howTo.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 text-[15px] text-ink-2">
            The step that does this is called <strong>{t.stepName}</strong>. Your file is read by your browser and never sent to our servers.
          </p>
        </section>

        {ex.before.columns.length > 0 && t.example.steps.length > 0 && (
          <section aria-labelledby="example" className="mt-12">
            <h2 id="example" className="display text-[1.9rem] sm:text-[2.3rem]">
              Example
            </h2>
            <p className="mt-2 text-[15px] text-ink-2">{t.example.note} (Produced by the same cleaner as above.)</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Table table={ex.before} label="Before" />
              <Table table={ex.after} label="After" />
            </div>
          </section>
        )}

        <section aria-labelledby="faq" className="mt-12">
          <h2 id="faq" className="display text-[1.9rem] sm:text-[2.3rem]">
            Questions
          </h2>
          <div className="mt-4 space-y-3">
            {t.faq.map((f) => (
              <details key={f.q} className="card-pop px-5 py-3">
                <summary className="cursor-pointer text-[16px] font-bold">{f.q}</summary>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="more" className="mt-12">
          <h2 id="more" className="text-[1.3rem] font-extrabold">
            More free cleanup tools
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/tools/${o.slug}`} className="inline-block rounded-full border-2 border-ink bg-surface px-3 py-1 text-[14px] font-semibold hover:bg-lemon-soft">
                  {o.h1}
                </Link>
              </li>
            ))}
          </ul>
          {t.guide && (
            <p className="mt-4 text-[15px]">
              <Link href={t.guide.href} className="font-semibold underline underline-offset-2">
                {t.guide.label}
              </Link>
              {" · "}
              <Link href="/pricing" className="font-semibold underline underline-offset-2">
                Pro: bigger files, 20 files at once, saved workflows ($9/month)
              </Link>
            </p>
          )}
        </section>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "FAQPage",
              mainEntity: t.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@type": "HowTo",
              name: t.h1,
              step: t.howTo.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s })),
            },
            {
              "@type": "WebApplication",
              name: "GridRinse",
              url: `${base}/tools/${t.slug}`,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Any (web browser)",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            },
          ],
        }}
      />
    </article>
  );
}
