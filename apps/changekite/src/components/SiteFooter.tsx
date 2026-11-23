import Link from "next/link";
import { KiteMark } from "./SiteHeader";

const COLS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["/docs", "What we check"],
      ["/tools", "Tools"],
      ["/pricing", "Pricing"],
      ["/bot", "ChangeKiteBot"],
    ],
  },
  {
    title: "Learn",
    links: [
      ["/guides", "Guides"],
      ["/help", "Help center"],
      ["/support", "Contact support"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 overflow-hidden border-t-2 border-ink">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-6 pt-12 md:px-8 lg:grid-cols-[1.2fr_2fr] lg:px-12">
        <p className="max-w-sm text-[0.95rem] leading-relaxed text-ink-soft">
          ChangeKite reads your public pages the way a careful crawler would, and writes down what it finds. Nothing is changed on your site.
        </p>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.title}>
              <p className="text-sm font-extrabold text-ink">{c.title}</p>
              <ul className="mt-3 space-y-2 text-[0.95rem]">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link className="text-ink-soft hover:text-accent" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex max-w-7xl items-end gap-3 px-5 md:px-8 lg:px-12" aria-hidden="true">
        <KiteMark className="mb-[3vw] h-[8vw] w-[8vw] max-h-20 max-w-20 shrink-0 lg:mb-12" />
        <p className="display select-none pb-10 text-[15vw] leading-[0.95] text-ink lg:text-[112px]">ChangeKite</p>
      </div>
    </footer>
  );
}
