import Link from "next/link";

const TABS = [
  { href: "/account", label: "Profile & security" },
  { href: "/account/team", label: "Team" },
  { href: "/account/billing", label: "Billing" },
];

export function AccountTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Account" className="mt-4 flex flex-wrap gap-1 border-b border-rule">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${t.href === current ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
