import Link from "next/link";
import { priceLabel, templateImages, type Template } from "@/content/templates";

/** A row of template cards (cover, name, price) linking to /templates/<slug>. Renders nothing for an empty list. */
export function TemplateStrip({ templates, heading, intro, id = "templates" }: { templates: Template[]; heading: string; intro?: string; id?: string }) {
  if (!templates.length) return null;
  return (
    <section aria-labelledby={id} className="mt-14">
      <h2 id={id} className="display text-[2rem] sm:text-[2.3rem]">
        {heading}
      </h2>
      {intro && <p className="mt-2 max-w-3xl text-[15.5px] text-ink-2">{intro}</p>}
      <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {templates.slice(0, 3).map((t) => {
          const img = templateImages(t).card;
          return (
            <li key={t.slug}>
              <Link href={`/templates/${t.slug}`} className="card-pop lift flex h-full items-center gap-4 overflow-hidden pr-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt="" width={600} height={450} loading="lazy" decoding="async" className="aspect-[4/3] w-28 shrink-0 border-r-[3px] border-ink object-cover sm:w-32" />
                <span className="py-3">
                  <span className="block text-[16px] font-extrabold leading-tight">{t.h1}</span>
                  <span className="mt-1 block text-[14px] font-semibold text-ink-2">Excel + Google Sheets · {priceLabel(t.priceCents)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[15px]">
        <Link href="/templates" className="font-semibold underline underline-offset-2">
          All spreadsheet templates
        </Link>
      </p>
    </section>
  );
}
