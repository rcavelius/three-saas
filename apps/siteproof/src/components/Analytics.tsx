"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/client/track";

/** One pageview per client-side route. Private report/inspector URLs are reported without their id. */
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    track("pageview", { route: pathname.replace(/^\/report\/[^/]+/, "/report/:id").replace(/^\/dashboard\/sites\/[^/]+/, "/dashboard/sites/:id") });
  }, [pathname]);
  return null;
}

/** Fires one event when mounted (e.g. signup_completed on the verification result page). */
export function TrackOnMount({ name, props }: { name: Parameters<typeof track>[0]; props?: Record<string, string> }) {
  useEffect(() => {
    track(name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
