"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { timeUntil } from "@/lib/format";
import type { EndpointDTO } from "@/lib/types";

/** The visitor's own endpoints (identified by the owner cookie). Renders nothing when there are none. */
export function MyEndpoints() {
  const [endpoints, setEndpoints] = useState<EndpointDTO[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api<{ endpoints: EndpointDTO[] }>("/api/endpoints", { signal: ctrl.signal })
      .then((r) => setEndpoints(r.endpoints))
      .catch(() => setEndpoints([]));
    return () => ctrl.abort();
  }, []);

  if (!endpoints || endpoints.length === 0) return null;
  return (
    <section aria-labelledby="my-endpoints" className="border border-line rounded-[6px] bg-surface">
      <h2 id="my-endpoints" className="label px-4 pt-3 pb-2">
        Your endpoints on this browser
      </h2>
      <ul className="divide-y divide-line border-t border-line">
        {endpoints.map((e) => (
          <li key={e.id}>
            <Link href={`/e/${e.id}`} className="flex items-center gap-4 px-4 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2">
              <span className="text-[14px] font-medium truncate">{e.name}</span>
              <span className="font-mono text-[12px] text-fg-dim truncate hidden md:inline">/h/{e.slug}</span>
              <span className="ml-auto font-mono text-[12px] text-fg-muted tabular-nums">
                {e.storedCount} req
              </span>
              <span className={`font-mono text-[12px] tabular-nums ${e.expired ? "text-err" : "text-fg-dim"}`}>
                {e.expired ? "expired" : `expires in ${timeUntil(e.expiresAt)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
