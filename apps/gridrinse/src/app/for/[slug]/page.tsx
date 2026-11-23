import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { AUDIENCES, getAudience } from "@/content/audiences";
import { appUrl } from "@/lib/site";

export function generateStaticParams() {
  return AUDIENCES.map((a) => ({ slug: a.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getAudience(slug);
  return a ? pageMeta({ title: a.title, description: a.summary, path: `/for/${a.slug}` }) : {};
}

function Table({ rows, label }: { rows: string[][]; label: string }) {
  return (
    <div className="card-pop overflow-hidden">
      <p className={`border-b-2 border-ink px-4 py-2 text-[17px] font-extrabold ${label === "After" ? "bg-accent text-white" : "bg-lemon"}`}>{label === "After" ? "Cleaned" : "Before"}</p>
      <div className="overflow-x-auto p-2.5">
      <table className="w-full border-collapse bg-surface font-mono text-[12.5px]">
        <thead>
          <tr>
            {rows[0]!.map((h) => (
              <th key={h} scope="col" className="border border-rule bg-sunken px-2 py-1 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="whitespace-pre border border-rule px-2 py-1">
                  {c === "" ? <span className="text-ink-3">(blank)</span> : c}
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

export default async function AudiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getAudience(slug);
  if (!a) notFound();
  return (
    <article>
      <PageHero eyebrow={a.label} title={a.title}>
        <p>{a.summary}</p>
        <div className="mt-7 flex flex-wrap gap-4">
          <Link href="/#start" className="btn-pop">
            Clean a file now, free
          </Link>
          <Link href="/pricing" className="btn-pop btn-pop-ghost">
            See Pro, $9/month
          </Link>
        </div>
      </PageHero>
      <div className="mx-auto max-w-[960px] px-4 py-10 sm:px-8 sm:py-14">

      <figure className="grid gap-7">
        <Table rows={a.example.before} label="Before" />
        <Table rows={a.example.after} label="After" />
        <figcaption className="text-[15px] font-medium text-ink-2">{a.example.caption}</figcaption>
      </figure>

      <div className="prose-doc card-pop mt-10 px-5 py-4 text-[17px] sm:px-8 sm:py-6">{a.body}</div>

      <section className="mt-14">
        <h2 className="display text-[2.2rem] sm:text-[2.8rem]">Questions</h2>
        <dl className="card-pop mt-6 divide-y-2 divide-ink">
          {a.faq.map((f) => (
            <div key={f.q} className="px-5 py-5 sm:px-6">
              <dt className="text-[18px] font-extrabold">{f.q}</dt>
              <dd className="mt-1.5 text-[16px] font-medium leading-relaxed text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card-pop mt-14 bg-mint-soft px-5 py-6 sm:px-8">
        <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">Try it on this month&rsquo;s export</h2>
        <p className="mt-2 text-[16px] font-medium text-ink-2">
          The cleaner is free in your browser, no sign-up. When the steps are right, save them as a workflow; Pro keeps them in your account for $9/month, cancel any time.
        </p>
        <div className="mt-5 flex flex-wrap gap-4">
          <Link href="/#start" className="btn-pop">
            Open the cleaner
          </Link>
          <Link href="/signup?plan=pro" className="btn-pop btn-pop-ghost">
            Start Pro
          </Link>
        </div>
      </section>

      <p className="mt-10 text-[16px] font-medium text-ink-2">
        Other uses:{" "}
        {AUDIENCES.filter((x) => x.slug !== a.slug).map((x, i) => (
          <span key={x.slug}>
            {i > 0 ? " · " : ""}
            <Link href={`/for/${x.slug}`} className="font-bold underline decoration-2 underline-offset-4">
              {x.label}
            </Link>
          </span>
        ))}
      </p>

      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          url: `${appUrl()}/for/${a.slug}`,
          mainEntity: a.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
    </article>
  );
}
