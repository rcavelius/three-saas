"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientEntitlements } from "./limits";

export async function fetchEntitlements(): Promise<ClientEntitlements | null> {
  try {
    const res = await fetch("/api/me/entitlements", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ClientEntitlements;
  } catch {
    return null;
  }
}

/** Server-provided plan and limits for the current visitor (anonymous visitors get the free plan). */
export function useEntitlements(loader: () => Promise<ClientEntitlements | null> = fetchEntitlements) {
  const [data, setData] = useState<ClientEntitlements | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const e = await loader();
    setData(e);
    setLoaded(true);
    return e;
  }, [loader]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { entitlements: data, loaded, refresh };
}
