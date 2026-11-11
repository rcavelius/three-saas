"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { timeUntil } from "@/lib/format";
import type { EndpointDTO } from "@/lib/types";

function Row({ e }: { e: EndpointDTO }) {
  return (
    <li>
      <Link href={`/e/${e.id}`} className="flex items-center gap-4 px-4 py-2.5 hover:bg-surface-2 focus-visible:bg-surface-2">
        <span className="text-[14px] font-medium truncate">{e.name}</span>
        <span className="font-mono text-[12px] text-fg-dim truncate hidden md:inline">/h/{e.slug}</span>
        <span className="ml-auto font-mono text-[12px] text-fg-muted tabular-nums">{e.storedCount} req</span>
        <span className={`font-mono text-[12px] tabular-nums ${e.expired || e.locked ? "text-err" : "text-fg-dim"}`}>
          {e.locked ? "paused (plan limit)" : e.expired ? "expired" : e.expiresAt ? `expires in ${timeUntil(e.expiresAt)}` : "no expiry"}
        </span>
      </Link>
    </li>
  );
}

/**
 * The visitor's endpoints: the workspace's (signed in) and this browser's anonymous ones, with a
 * "claim" action after sign-in. Renders nothing when there are none.
 */
export function MyEndpoints({ title }: { title?: string }) {
  const [data, setData] = useState<{ endpoints: EndpointDTO[]; anonymous: EndpointDTO[]; signedIn: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await api("/api/endpoints", { signal }));
    } catch {
      setData({ endpoints: [], anonymous: [], signedIn: false });
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function claim() {
    try {
      const r = await api<{ claimed: number; skipped: number }>("/api/endpoints/claim", { method: "POST", body: {} });
      setMsg(
        r.skipped
          ? `Claimed ${r.claimed}. ${r.skipped} stayed anonymous because your plan's endpoint limit is reached.`
          : `Claimed ${r.claimed} endpoint${r.claimed === 1 ? "" : "s"}.`,
      );
      void load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not claim endpoints.");
    }
  }

  if (!data || (data.endpoints.length === 0 && data.anonymous.length === 0 && !msg)) return null;
  return (
    <div className="grid gap-4">
      {/* Outside the anonymous section: after a successful claim that section disappears. */}
      {msg && (
        <p role="status" className="text-[12.5px] text-fg-muted">
          {msg}
        </p>
      )}
      {data.endpoints.length > 0 && (
        <section aria-labelledby="my-endpoints" className="border border-line rounded-[6px] bg-surface">
          <h2 id="my-endpoints" className="label px-4 pt-3 pb-2">
            {title ?? (data.signedIn ? "Your workspace's endpoints" : "Your endpoints on this browser")}
          </h2>
          <ul className="divide-y divide-line border-t border-line">
            {data.endpoints.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        </section>
      )}
      {data.anonymous.length > 0 && (
        <section aria-labelledby="anon-endpoints" className="border border-signal/40 rounded-[6px] bg-surface">
          <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-3">
            <h2 id="anon-endpoints" className="label">
              Anonymous endpoints on this browser
            </h2>
            <button type="button" className="btn btn-signal h-7 ml-auto" onClick={() => void claim()}>
              Claim my anonymous endpoints
            </button>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {data.anonymous.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
