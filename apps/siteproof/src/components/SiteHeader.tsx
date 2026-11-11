import Link from "next/link";

const NAV = [
  { href: "/docs", label: "What we check" },
  { href: "/pricing", label: "Pricing" },
  { href: "/bot", label: "The crawler" },
];

export function SiteHeader() {
  return (
    <header className="no-print border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-3 no-underline">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">SiteProof</span>
          <span className="eyebrow hidden sm:inline">Website inspection</span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[0.95rem]">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
