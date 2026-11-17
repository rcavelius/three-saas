"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/authClient";

/** First-party pageview beacon (pathname only, no query string, no cookies). */
export function PageviewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("pageview");
  }, [pathname]);
  return null;
}

/** Main menu; the current section gets a highlighter pill. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname() ?? "/";
  return (
    <ul className="flex items-center gap-x-2 whitespace-nowrap text-[14px] font-bold sm:gap-x-3 sm:text-[15px] lg:gap-x-4 lg:text-[17px]">
      {items.map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`) || (n.href === "/guides" && pathname.startsWith("/for/"));
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`inline-block rounded-lg px-2.5 py-1 decoration-2 underline-offset-4 sm:px-3 ${active ? "bg-lemon" : "hover:underline"}`}
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Account links in the header: reads the session from our own /api/auth (same origin). */
export function AccountNav() {
  const { data, isPending } = authClient().useSession();
  const cta = "inline-flex min-h-10 items-center rounded-[10px] border-2 border-ink bg-accent px-3 text-[14px] sm:min-h-11 font-extrabold text-white hover:bg-accent-ink sm:px-6 sm:text-[17px]";
  if (isPending) return <span className="inline-block h-10 w-36 sm:h-11 sm:w-72" aria-hidden="true" />;
  if (!data) {
    return (
      <span className="flex items-center gap-x-3 sm:gap-x-8">
        <Link href="/login" className="text-[14px] font-bold underline decoration-2 underline-offset-4 sm:text-[17px]">
          Log in
        </Link>
        <Link href="/signup" className={cta}>
          <span className="sm:hidden">Start free</span>
          <span className="hidden sm:inline">Get started free</span>
        </Link>
      </span>
    );
  }
  return (
    <Link href="/account" className={cta}>
      Your account
    </Link>
  );
}
