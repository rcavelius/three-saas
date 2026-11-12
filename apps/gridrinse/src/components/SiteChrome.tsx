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
  if (isPending) return <span className="inline-block w-24" aria-hidden="true" />;
  if (!data) {
    return (
      <span className="flex gap-x-4">
        <Link href="/login" className="hover:text-ink">
          Log in
        </Link>
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Sign up
        </Link>
      </span>
    );
  }
  return (
    <Link href="/account" className="hover:text-ink">
      Account
    </Link>
  );
}
