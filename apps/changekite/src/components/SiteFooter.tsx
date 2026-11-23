import Link from "next/link";
import { KiteMark, Star } from "./KiteMark";

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
    <footer className="no-print bg-ink text-white">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 pb-14 pt-16 md:px-8 lg:grid-cols-[1.1fr_1.6fr] lg:px-6 lg:pt-20">
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3 no-underline" aria-label="ChangeKite home">
            <KiteMark className="h-12 w-12 -rotate-12" />
            <span className="display text-[2.5rem] leading-none text-yellow">ChangeKite</span>
          </Link>
          <p className="mt-5 max-w-sm text-[1.0625rem] leading-relaxed text-white/85">
            Reads your public pages like a careful crawler and tells you what it found. It never changes your site.
          </p>
          <Star className="absolute -top-6 left-56 h-9 w-9 rotate-12" fill="var(--color-cyan)" />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.title}>
              <p className="display text-[1.25rem] text-yellow">{c.title}</p>
              <ul className="mt-4 space-y-3 text-[1rem] font-semibold">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link className="text-white/85 transition-colors hover:text-white" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
