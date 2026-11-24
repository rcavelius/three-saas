import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { BuyTemplateButton } from "@/components/templates/BuyTemplateButton";
import { getGuide } from "@/content/guides";
import { ACCESS_DAYS, BUNDLE, bundleSavingsCents, formatFileSize, getTemplate, priceLabel, TEMPLATES, templateImages } from "@/content/templates";
import { getTool } from "@/content/tools";
import { breadcrumbLd } from "@/lib/seo";
import { appUrl } from "@/lib/site";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getTemplate(slug);
  if (!t) return {};
  const img = templateImages(t).hero;
  const url = `/templates/${t.slug}`;
  return {
    title: { absolute: t.title },
    description: t.description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "GridRinse", title: t.title, description: t.description, url, images: [{ url: img.src, width: 1200, height: 900, alt: img.alt }] },
    twitter: { card: "summary_large_image", title: t.title, description: t.description, images: [img.src] },
  };
}

const KIND_LABEL = { excel: "Excel workbook (.xlsx)", gsheets: "Google Sheets version (.xlsx, upload to Drive)", guide: "Quick-start guide (PDF)" } as const;

const SHARED_FAQ = (name: string) => [
  {
    q: "How do I get the file after paying?",
    a: `Right after payment you land on your download page with the Excel file, the Google Sheets file and the PDF guide. We also email you the link; it works for ${ACCESS_DAYS} days on any device. Once downloaded, the files are yours to keep.`,
  },
  {
    q: "Does it work in Google Sheets and on a Mac?",
    a: "Yes. Use the Excel file in Microsoft Excel 2010 or newer (Windows, Mac or Excel for the web), or upload the Google Sheets version to Google Drive and open it with Google Sheets. Apple Numbers is not supported.",
  },
  {
    q: "Are there macros, passwords or locked cells?",
    a: "No macros and no passwords. In the Excel version the dashboard is protected without a password, only to stop accidental typing (Review → Unprotect Sheet undoes it). The Google Sheets version is not protected.",
  },
  {
    q: "Is it a subscription?",
    a: `No. You pay once. The ${name} is a one-time digital download.`,
  },
  {
    q: "Can I get a refund?",
    a: "If a file does not open or does not work as this page describes, email support within 14 days of purchase and a person will fix it or refund it in full (see the terms).",
  },
  {
    q: "Was AI used to make it?",
    a: "Yes. The template was built with AI assistance, then every sheet was recalculated in Microsoft Excel with zero formula errors. The cover and lifestyle pictures are AI-generated mockups with a real screenshot on the screen; the gallery screenshots are real.",
  },
];

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTemplate(slug);
  if (!t) notFound();
  const base = appUrl();
  const imgs = templateImages(t);
  const faq = [...t.faq, ...SHARED_FAQ(t.name)];
  const others = TEMPLATES.filter((o) => o.slug !== t.slug);
  const tools = t.tools.map((s) => getTool(s)).filter((x): x is NonNullable<typeof x> => !!x);
  const guides = t.guides.map((s) => getGuide(s)).filter((x): x is NonNullable<typeof x> => !!x);
  const price = priceLabel(t.priceCents);

  return (
    <article>
      <section className="mint-grid overflow-hidden">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <nav aria-label="Breadcrumb" className="text-[15px] font-bold">
              <Link href="/templates" className="underline decoration-2 underline-offset-4 hover:text-mint">
                Templates
              </Link>{" "}
              / {t.category}
            </nav>
            <p className="chip rise mt-4">Excel + Google Sheets · instant download</p>
            <h1 className="display display-out mt-5 max-w-[16ch] text-[clamp(2.7rem,8.5vw,5.4rem)] leading-[0.92]">{t.h1}</h1>
            <p className="rise mt-5 max-w-[40rem] text-[19px] font-semibold leading-snug sm:text-[21px]">{t.tagline}</p>
            <div className="ink-zone mt-7 flex flex-wrap items-center gap-4">
              <BuyTemplateButton productId={t.slug} label={`Buy and download · ${price}`} from="template_page" />
              <span className="rounded-lg border-[3px] border-ink bg-surface px-3 py-1.5 text-[15px] font-bold">One-time · no subscription</span>
            </div>
            <p className="mt-4 text-[15px] font-semibold">Secure checkout by Stripe. Download link emailed and valid {ACCESS_DAYS} days.</p>
          </div>
          <figure className="card-pop overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgs.hero.src} alt={imgs.hero.alt} width={1200} height={900} fetchPriority="high" decoding="async" className="aspect-[4/3] w-full object-cover" />
            <figcaption className="border-t-[3px] border-ink px-4 py-2 text-[13.5px] font-semibold text-ink-2">
              Mockup: AI-generated setting, real screenshot of the file on screen
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-8">
        <section aria-labelledby="what" className="mt-14 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 id="what" className="display text-[2.2rem] sm:text-[2.6rem]">
              What it does
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed">{t.intro}</p>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
              <strong>Made for:</strong> {t.forWho}
            </p>
            <ul className="mt-5 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex gap-3 text-[16px] leading-snug">
                  <span aria-hidden="true" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-[2.5px] border-ink bg-mint text-[13px] font-black">
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-pop self-start bg-pink px-5 py-5 sm:px-6">
            <h2 className="display text-[2rem]">What you get</h2>
            <ul className="mt-3 space-y-2 text-[15.5px]">
              {t.files.map((f) => (
                <li key={f.name} className="rounded-lg border-[2.5px] border-ink bg-surface px-3 py-2">
                  <span className="block font-bold">{KIND_LABEL[f.kind]}</span>
                  <span className="font-mono text-[12.5px] text-ink-2">
                    {f.name} · {formatFileSize(f.bytes)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14.5px] font-semibold">Comes with sample data: select the white cells and press Delete to start fresh. Any currency.</p>
            <div className="mt-4">
              <BuyTemplateButton productId={t.slug} label={`Buy · ${price}`} from="template_page" className="btn-pop w-full bg-mint" />
            </div>
          </div>
        </section>

        <section aria-labelledby="gallery" className="mt-14">
          <h2 id="gallery" className="display text-[2.2rem] sm:text-[2.6rem]">
            Look inside
          </h2>
          <ul className="mt-5 grid gap-6 md:grid-cols-2">
            {imgs.gallery.map((g) => (
              <li key={g.src}>
                <figure className="card-pop overflow-hidden">
                  <a href={g.src} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.src} alt={g.alt} width={1200} height={900} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
                  </a>
                  <figcaption className="border-t-[3px] border-ink px-4 py-2 text-[14px] font-bold">{g.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sheets" className="mt-14">
          <h2 id="sheets" className="display text-[2.2rem] sm:text-[2.6rem]">
            The sheets inside
          </h2>
          <div className="card-pop mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15.5px]">
              <thead>
                <tr className="bg-sunken">
                  <th scope="col" className="border-b-[3px] border-ink px-4 py-2.5 font-extrabold">
                    Sheet
                  </th>
                  <th scope="col" className="border-b-[3px] border-ink px-4 py-2.5 font-extrabold">
                    What it is for
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.sheets.map((s) => (
                  <tr key={s.name} className="border-b border-rule last:border-0">
                    <th scope="row" className="whitespace-nowrap px-4 py-2.5 font-bold">
                      {s.name}
                    </th>
                    <td className="px-4 py-2.5">{s.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="start" className="mt-14">
          <h2 id="start" className="display text-[2.2rem] sm:text-[2.6rem]">
            How you start
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-6 text-[16px] leading-relaxed">
            {t.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {t.tips.length > 0 && (
            <div className="card-pop mt-6 bg-mint-soft px-5 py-4">
              <h3 className="text-[17px] font-extrabold">Good to know</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15.5px] leading-relaxed">
                {t.tips.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="faq" className="mt-14">
          <h2 id="faq" className="display text-[2.2rem] sm:text-[2.6rem]">
            Questions
          </h2>
          <div className="mt-4 space-y-3">
            {faq.map((f) => (
              <details key={f.q} className="card-pop px-5 py-3">
                <summary className="cursor-pointer text-[16px] font-bold">{f.q}</summary>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="buy-again" className="card-pop mt-14 flex flex-col gap-5 bg-mint px-5 py-6 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="buy-again" className="display text-[2.2rem] leading-[0.95]">
              {t.h1} · {price}
            </h2>
            <p className="mt-2 text-[16px] font-semibold">
              Or get all {TEMPLATES.length} templates for {priceLabel(BUNDLE.priceCents)} (save {priceLabel(bundleSavingsCents())}).
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BuyTemplateButton productId={t.slug} label={`Buy · ${price}`} from="template_page" />
            <BuyTemplateButton productId={BUNDLE.id} label={`All ${TEMPLATES.length} · ${priceLabel(BUNDLE.priceCents)}`} from="template_page" className="btn-pop btn-pop-ghost bg-surface" />
          </div>
        </section>

        {(tools.length > 0 || guides.length > 0) && (
          <section aria-labelledby="clean" className="mt-14">
            <h2 id="clean" className="display text-[2rem]">
              Getting data in? Clean it first, free
            </h2>
            <p className="mt-2 text-[15.5px] text-ink-2">Bank, shop and booking exports often have messy dates, numbers or duplicates. These free tools fix them in your browser before you paste.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {tools.map((o) => (
                <li key={o.slug}>
                  <Link href={`/tools/${o.slug}`} className="lift inline-block rounded-full border-[3px] border-ink bg-surface px-3.5 py-1.5 text-[15px] font-bold shadow-[3px_3px_0_#0a0a0a] hover:bg-mint">
                    {o.h1}
                  </Link>
                </li>
              ))}
              {guides.map((g) => (
                <li key={g.slug}>
                  <Link href={`/guides/${g.slug}`} className="lift inline-block rounded-full border-[3px] border-ink bg-sunken px-3.5 py-1.5 text-[15px] font-bold shadow-[3px_3px_0_#0a0a0a] hover:bg-mint">
                    Guide: {g.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="more" className="mt-14">
          <h2 id="more" className="display text-[2rem]">
            More templates
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/templates/${o.slug}`} className="lift inline-block rounded-full border-[3px] border-ink bg-surface px-3.5 py-1.5 text-[15px] font-bold shadow-[3px_3px_0_#0a0a0a] hover:bg-pink">
                  {o.h1} · {priceLabel(o.priceCents)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Product",
              name: t.name,
              description: t.description,
              image: [`${base}${imgs.hero.src}`, ...imgs.gallery.map((g) => `${base}${g.src}`)],
              sku: `gridrinse-template-${t.slug}`,
              category: "Spreadsheet template",
              brand: { "@type": "Brand", name: "GridRinse" },
              offers: {
                "@type": "Offer",
                url: `${base}/templates/${t.slug}`,
                price: (t.priceCents / 100).toFixed(2),
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
                itemCondition: "https://schema.org/NewCondition",
                seller: { "@type": "Organization", name: "GridRinse" },
              },
            },
            {
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            breadcrumbLd(base, [
              ["Home", "/"],
              ["Templates", "/templates"],
              [t.name, `/templates/${t.slug}`],
            ]),
          ],
        }}
      />
    </article>
  );
}
