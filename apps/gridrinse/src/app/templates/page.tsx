import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { BuyTemplateButton } from "@/components/templates/BuyTemplateButton";
import { ACCESS_DAYS, BUNDLE, bundleSavingsCents, priceLabel, TEMPLATES, templateImages } from "@/content/templates";
import { breadcrumbLd, pageMeta } from "@/lib/seo";
import { appUrl } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Excel & Google Sheets Templates: Budget, Bookkeeping, Inventory",
  absoluteTitle: true,
  description:
    "Spreadsheet templates for Excel and Google Sheets: budget planner, paycheck budget, debt payoff, bookkeeping, inventory, Etsy, wedding, landlord and Airbnb trackers.",
  path: "/templates",
});

const CATEGORIES = ["Personal finance", "Small business", "Property", "Life events"] as const;

export default function TemplatesIndex() {
  const base = appUrl();
  return (
    <article>
      <PageHero eyebrow="Excel + Google Sheets · instant download" title="Spreadsheet templates" art="sheet">
        <p>
          Ready-made workbooks for money, shops and rentals. Pay once, download right away: an Excel file, a Google Sheets
          file and a quick-start guide for each. No subscription, no macros, no passwords.
        </p>
        <p className="mt-4 text-[16px] font-semibold">
          Just need to tidy a messy CSV or Excel export first?{" "}
          <Link href="/tools" className="underline decoration-2 underline-offset-4">
            Use the free cleanup tools
          </Link>
          , for example{" "}
          <Link href="/tools/remove-duplicates-csv" className="underline decoration-2 underline-offset-4">
            remove duplicate rows
          </Link>
          .
        </p>
      </PageHero>

      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-8 sm:py-16">
        <section aria-labelledby="bundle" className="card-pop bg-mint px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="chip">Best value</p>
              <h2 id="bundle" className="display mt-3 text-[2.4rem] leading-[0.95] sm:text-[3rem]">
                All {TEMPLATES.length} templates for {priceLabel(BUNDLE.priceCents)}
              </h2>
              <p className="mt-3 text-[17px] font-semibold leading-snug">
                Every template below in one purchase: {priceLabel(bundleSavingsCents())} less than buying them one by one. Download links work for {ACCESS_DAYS} days; the files are
                yours to keep.
              </p>
            </div>
            <BuyTemplateButton productId={BUNDLE.id} label={`Get all ${TEMPLATES.length} · ${priceLabel(BUNDLE.priceCents)}`} from="catalog" />
          </div>
        </section>

        {CATEGORIES.map((cat) => {
          const list = TEMPLATES.filter((t) => t.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`} className="mt-14">
              <h2 id={`cat-${cat}`} className="display text-[2.2rem] sm:text-[2.6rem]">
                {cat}
              </h2>
              <ul className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => {
                  const img = templateImages(t).card;
                  return (
                    <li key={t.slug}>
                      <Link href={`/templates/${t.slug}`} className="card-pop lift flex h-full flex-col overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt={img.alt} width={600} height={450} loading="lazy" decoding="async" className="aspect-[4/3] w-full border-b-[3px] border-ink object-cover" />
                        <div className="flex flex-1 flex-col gap-2 px-5 py-4">
                          <h3 className="display text-[1.9rem] leading-[0.95]">{t.h1}</h3>
                          <p className="text-[15.5px] font-medium leading-snug">{t.tagline}</p>
                          <p className="mt-auto flex items-center justify-between pt-2">
                            <span className="rounded-lg border-[3px] border-ink bg-pink px-2.5 py-0.5 text-[18px] font-extrabold">{priceLabel(t.priceCents)}</span>
                            <span className="text-[15px] font-bold underline decoration-2 underline-offset-4">See inside →</span>
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <section aria-labelledby="how" className="mt-16 grid gap-6 lg:grid-cols-3">
          <h2 id="how" className="sr-only">
            How buying works
          </h2>
          {[
            ["1. Pay securely", "Checkout is run by Stripe. Card, Apple Pay or Google Pay. No account needed."],
            ["2. Download at once", `You land on your download page straight away, and we email you the link. It works for ${ACCESS_DAYS} days on any device.`],
            ["3. Open in Excel or Google Sheets", "Each template comes as an Excel workbook, a Google-Sheets-ready workbook and a quick-start PDF. Sample data shows how it works."],
          ].map(([h, p]) => (
            <div key={h} className="card-pop px-5 py-5">
              <h3 className="text-[19px] font-extrabold">{h}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed">{p}</p>
            </div>
          ))}
        </section>

        <p className="mt-10 max-w-3xl text-[14.5px] leading-relaxed text-ink-3">
          How these were made: the templates were built with AI assistance, then every workbook was recalculated in
          Microsoft Excel with zero formula errors. Gallery screenshots are real screenshots of the files with sample data.
          The laptop and room photos on the cover images are AI-generated mockups; the screen in each one shows a real
          screenshot. Need to clean a messy export before pasting it in? Use the free{" "}
          <Link href="/tools" className="font-semibold underline underline-offset-2">
            GridRinse cleanup tools
          </Link>
          .
        </p>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "ItemList",
              name: "GridRinse spreadsheet templates",
              itemListElement: TEMPLATES.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/templates/${t.slug}`, name: t.name })),
            },
            breadcrumbLd(base, [
              ["Home", "/"],
              ["Templates", "/templates"],
            ]),
          ],
        }}
      />
    </article>
  );
}
