import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { AUDIENCES, getAudience } from "@/content/audiences";
import { appUrl } from "@/lib/site";

export function generateStaticParams() {
  return AUDIENCES.map((a) => ({ slug: a.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = getAudience(slug);
  return a ? { title: a.title, description: a.summary, alternates: { canonical: `/for/${a.slug}` }, openGraph: { type: "website", title: a.title, description: a.summary } } : {};
}

function Table({ rows, label }: { rows: string[][]; label: string }) {
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-ink-3">{label}</p>
      <table className="w-full border-collapse border border-rule bg-surface font-mono text-[12.5px]">
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
  );
}

export default async function AudiencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = getAudience(slug);
  if (!a) notFound();
  return (
    <article className="mx-auto max-w-[860px] px-4 py-10 sm:px-6">
      <p className="eyebrow">{a.label}</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight sm:text-[2.1rem]">{a.title}</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] text-ink-2">{a.summary}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="" className="btn btn-primary">
          Clean a file now — free, no account
        </Link>
        <Link href="" className="btn">
          See Pro — $9/month
        </Link>
      </div>

      <figure className="mt-8 grid gap-4 md:grid-cols-2">
        <Table rows={a.example.before} label="Before" />
        <Table rows={a.example.after} label="After" />
        <figcaption className="text-xs text-ink-3 md:col-span-2">{a.example.caption}</figcaption>
      </figure>

      <div className="prose-doc mt-8 border-t border-rule pt-2">{a.body}</div>

      <section className="mt-8 border-t border-rule pt-6">
        <h2 className="text-lg font-semibold">Questions</h2>
        <dl className="mt-3 space-y-4">
          {a.faq.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10 border border-rule bg-surface px-5 py-5">
        <h2 className="text-lg font-semibold">Try it on this month&rsquo;s export</h2>
        <p className="mt-1 text-sm text-ink-2">
          The cleaner is free in your browser, no sign-up. When the steps are right, save them as a workflow; Pro keeps them in your account for $9/month, cancel any time.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href="" className="btn btn-primary">
            Open the cleaner
          </Link>
          <Link href="/signup?plan=pro" className="btn">
            Start Pro
          </Link>
        </div>
      </section>

      <p className="mt-8 text-sm text-ink-3">
        Other uses:{" "}
        {AUDIENCES.filter((x) => x.slug !== a.slug).map((x, i) => (
          <span key={x.slug}>
            {i > 0 ? " · " : ""}
            <Link href={`/for/${x.slug}`}>{x.label}</Link>
          </span>
        ))}
      </p>

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
