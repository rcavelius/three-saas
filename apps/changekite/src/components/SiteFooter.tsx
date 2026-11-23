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
    <footer className="no-print mt-28 bg-night text-white">
      <div className="mx-auto grid max-w-[1360px] gap-12 px-5 pb-12 pt-16 md:px-8 lg:grid-cols-[1.1fr_1.6fr] lg:px-12 lg:pb-16 lg:pt-24">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 no-underline" aria-label="ChangeKite home">
            <KiteMark className="h-11 w-11" />
            <span className="display text-[2rem] !leading-none">ChangeKite</span>
          </Link>
          <p className="mt-6 max-w-sm text-[1.0625rem] leading-relaxed text-white/80">
            Reads your public pages the way a careful crawler would and tells you what it found. Nothing on your site is changed.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.title}>
              <p className="text-[0.95rem] font-extrabold text-white">{c.title}</p>
              <ul className="mt-4 space-y-3 text-[1rem]">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link className="text-white/75 transition-colors hover:text-white" href={href}>
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
