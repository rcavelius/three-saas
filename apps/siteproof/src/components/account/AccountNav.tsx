import Link from "next/link";

const ITEMS = [
  { href: "/account", label: "Profile & security" },
  { href: "/account/team", label: "Team" },
  { href: "/account/billing", label: "Plan & billing" },
  { href: "/dashboard", label: "Monitored sites" },
];

export function AccountNav({ current }: { current: string }) {
  return (
    <nav aria-label="Account" className="mt-8 border-b border-rule">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 pb-3 text-[0.95rem]">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={current === i.href ? "page" : undefined}
              className={current === i.href ? "font-semibold text-ink underline underline-offset-8" : "text-ink-soft hover:text-ink hover:underline"}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
