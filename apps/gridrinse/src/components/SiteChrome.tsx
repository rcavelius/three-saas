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
