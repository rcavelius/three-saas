import Link from "next/link";

const TABS = [
  { href: "/account", label: "Profile & security" },
  { href: "/account/team", label: "Team" },
  { href: "/account/billing", label: "Billing" },
];

export function AccountTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Account" className="mt-5 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`rounded-full border-[2.5px] border-ink px-4 py-1.5 text-[15px] font-bold transition-colors duration-150 ${t.href === current ? "bg-ink text-white" : "bg-surface hover:bg-mint"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
