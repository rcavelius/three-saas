"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header nav cells; the current section is marked with aria-current (orange underline). */
export function NavLinks({ items }: { items: [string, string][] }) {
  const path = usePathname() ?? "/";
  return (
    <>
      {items.map(([href, label], i) => (
        <Link key={href} href={href} className={`g-nav ${i ? "border-l border-line" : ""}`} aria-current={path === href || path.startsWith(href + "/") ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </>
  );
}
