"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/track";

/** First-party pageview beacon on every client navigation. */
export function Pageview() {
  const path = usePathname();
  useEffect(() => {
    track("pageview");
  }, [path]);
  return null;
}
