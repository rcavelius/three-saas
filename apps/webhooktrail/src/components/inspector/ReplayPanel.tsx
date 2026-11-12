"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { maskBodyText } from "@/lib/mask-body";
import { classifyReplayHeader, MAX_REPLAY_BODY_BYTES, planReplayHeaders, REPLAYABLE_METHODS } from "@/lib/replay-headers";
import { displayHeaderValue } from "@/lib/sensitive";
import type { DestinationDTO, EndpointDTO, ReplayDTO, RequestDetailDTO } from "@/lib/types";

const STATUS_COLOR: Record<string, string> = {
  delivered: "text-ok",
  failed: "text-err",
  blocked: "text-err",
  skipped: "text-fg-dim",
  scheduled: "text-warn",
  running: "text-warn",
};

/**
 * Replay a captured request to a VERIFIED destination of the workspace. The form only ever sends a
 * destination id; sensitive headers are unticked by default; the preview is masked until revealed.
 */
export function ReplayPanel({ endpoint, request, bodyText }: { endpoint: EndpointDTO; request: RequestDetailDTO; bodyText: string | null }) {
  const [destinations, setDestinations] = useState<DestinationDTO[] | null>(null);
  const [destId, setDestId] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [attempts, setAttempts] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<ReplayDTO[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await api<{ replays: ReplayDTO[] }>(`/api/endpoints/${endpoint.id}/requests/${request.id}/replay`);
      setHistory(r.replays);
    } catch {
      /* history is best effort */
    }
  }, [endpoint.id, request.id]);

  useEffect(() => {
    if (!endpoint.permissions.canReplay) return;
    api<{ destinations: DestinationDTO[] }>("/api/destinations")
      .then((r) => {
        setDestinations(r.destinations);
        setDestId((cur) => cur || r.destinations.find((d) => d.verified)?.id || "");
      })
      .catch(() => setDestinations([]));
    void loadHistory();
  }, [endpoint.permissions.canReplay, loadHistory]);

  // Refresh while scheduled retries are pending.
  const pending = history.some((h) => h.status === "scheduled" || h.status === "running");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void loadHistory(), 5000);
    return () => clearInterval(t);
  }, [pending, loadHistory]);

  const plan = useMemo(() => planReplayHeaders(request.headers, [...ticked]), [request.headers, ticked]);
  const sensitiveNames = useMemo(
    () => [...new Set(request.headers.map(([k]) => k.toLowerCase()).filter((k) => classifyReplayHeader(k) === "sensitive"))],
    [request.headers],
  );

  if (!endpoint.permissions.canReplay) {
    return (
      <section className="border-b border-line px-4 py-3">
        <h3 className="label">Replay</h3>
        <p className="mt-2 text-[13px] text-fg-muted">
          {endpoint.owner === "anonymous"
            ? "Replay to your own verified destination needs an account: sign up or log in, then claim this endpoint."
            : "Replay to a verified destination is included in the Developer and Pro plans."}{" "}
          <Link className="text-signal underline underline-offset-2" href={endpoint.owner === "anonymous" ? "/signup" : "/pricing"}>
            {endpoint.owner === "anonymous" ? "Create an account" : "See plans"}
          </Link>
        </p>
      </section>
    );
  }

  const replayable = (REPLAYABLE_METHODS as readonly string[]).includes(request.method);
  const tooBig = request.storedBodySize > MAX_REPLAY_BODY_BYTES;
  const verified = (destinations ?? []).filter((d) => d.verified);
  const previewBody = bodyText === null ? null : reveal ? bodyText : maskBodyText(bodyText, request.contentType).text;

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ replays: ReplayDTO[] }>(`/api/endpoints/${endpoint.id}/requests/${request.id}/replay`, {
        method: "POST",
        body: { destinationId: destId, includeSensitiveHeaders: [...ticked], attempts },
      });
      const first = r.replays[0];
      setMsg({
        ok: first?.status === "delivered",
        text: first
          ? first.status === "delivered"
            ? `Delivered: ${first.responseStatus} in ${first.elapsedMs} ms.`
            : `${first.status}${first.responseStatus ? ` (${first.responseStatus})` : ""}: ${first.error ?? "see history"}${attempts > 1 && first.status === "failed" ? " — retries are scheduled." : ""}`
          : "Replay started.",
      });
      void loadHistory();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Replay failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="replay-h" className="border-b border-line px-4 py-3">
      <h3 id="replay-h" className="label">
        Replay
      </h3>
      {!replayable ? (
        <p className="mt-2 text-[13px] text-fg-muted">{request.method} requests cannot be replayed.</p>
      ) : tooBig ? (
        <p className="mt-2 text-[13px] text-fg-muted">Bodies over 1 MB cannot be replayed.</p>
      ) : destinations === null ? (
        <p className="mt-2 font-mono text-[12px] text-fg-dim">Loading destinations…</p>
      ) : verified.length === 0 ? (
        <p className="mt-2 text-[13px] text-fg-muted">
          No verified destination yet. Replays only go to destinations your workspace has verified.{" "}
          <Link className="text-signal underline underline-offset-2" href="/account/destinations">
            {endpoint.permissions.canManageDestinations ? "Add and verify a destination" : "Ask an owner or admin to add one"}
          </Link>
        </p>
      ) : (
        <form
          className="mt-2 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-wrap gap-2 items-end">
            <label className="grid gap-1 text-[12.5px]">
              <span className="text-fg-muted">Verified destination</span>
              <select className="field max-w-[28rem]" value={destId} onChange={(e) => setDestId(e.target.value)}>
                {verified.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.url}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[12.5px]">
              <span className="text-fg-muted">Attempts</span>
              <select className="field" value={attempts} onChange={(e) => setAttempts(Number(e.target.value))}>
                <option value={1}>Replay once</option>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    With retries: up to {n} attempts
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-signal" disabled={busy || !destId}>
              {busy ? "Sending…" : "Replay"}
            </button>
          </div>
          {attempts > 1 && (
            <p className="text-[12px] text-fg-dim">
              Attempt 1 is sent now. If it does not get a 2xx, the next attempts run from the job queue after 10 s, 20 s, 40 s and 80 s
              (on the next scheduler tick), stopping at the first 2xx.
            </p>
          )}

          {sensitiveNames.length > 0 && (
            <fieldset className="border border-line rounded-[4px] p-3">
              <legend className="px-1 text-[12.5px] text-fg-muted">Sensitive headers (not sent unless ticked for this replay)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {sensitiveNames.map((h) => (
                  <label key={h} className="inline-flex items-center gap-1.5 font-mono text-[12px]">
                    <input
                      type="checkbox"
                      checked={ticked.has(h)}
                      onChange={(e) =>
                        setTicked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(h);
                          else n.delete(h);
                          return n;
                        })
                      }
                    />
                    {h}
                    {(h === "cookie" || h === "cookie2") && <span className="text-fg-dim">(never forwarded)</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {plan.signatureWarnings.length > 0 && (
            <p className="text-[12.5px] text-warn">
              Signature headers are included ({plan.signatureWarnings.join(", ")}). Their signed timestamps are probably stale, so the receiver may
              reject the replay.
            </p>
          )}

          <details>
            <summary className="cursor-pointer text-[12.5px] text-fg-muted">
              Preview: {plan.send.length} header{plan.send.length === 1 ? "" : "s"}
              {plan.blocked.length ? `, ${plan.blocked.length} never forwarded` : ""}
            </summary>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn h-7" aria-pressed={reveal} onClick={() => setReveal((v) => !v)}>
                {reveal ? "Mask values" : "Reveal values"}
              </button>
            </div>
            <table className="mt-2 w-full font-mono text-[12px]">
              <tbody>
                {plan.send.map(([k, v], i) => (
                  <tr key={`${k}:${i}`} className="border-t border-line align-top">
                    <th scope="row" className="text-left font-normal text-fg-muted py-1 pr-3 whitespace-nowrap w-1">
                      {k}
                    </th>
                    <td className="py-1 break-all">{displayHeaderValue(k, v, reveal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.blocked.length > 0 && <p className="mt-1 text-[12px] text-fg-dim">Never forwarded: {plan.blocked.join(", ")}</p>}
            {previewBody !== null && previewBody !== "" && (
              <pre className="mt-2 max-h-48 overflow-auto p-2 bg-bg border border-line rounded-[4px] font-mono text-[12px] whitespace-pre-wrap break-all">
                {previewBody.slice(0, 4000)}
              </pre>
            )}
          </details>
          <p aria-live="polite" className={`text-[12.5px] min-h-[1.25rem] ${msg?.ok ? "text-ok" : "text-err"}`}>
            {msg?.text}
          </p>
        </form>
      )}

      {history.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[12.5px] text-fg-muted">Replay history (audit)</h4>
          <table className="mt-1 w-full font-mono text-[11.5px]">
            <thead>
              <tr className="text-left text-fg-dim">
                <th className="font-normal py-1 pr-2">when</th>
                <th className="font-normal py-1 pr-2">who</th>
                <th className="font-normal py-1 pr-2">destination</th>
                <th className="font-normal py-1 pr-2">try</th>
                <th className="font-normal py-1 pr-2">result</th>
                <th className="font-normal py-1">ms</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-line align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{new Date(h.finishedAt ?? h.runAt).toLocaleTimeString()}</td>
                  <td className="py-1 pr-2 break-all">{h.by ?? "—"}</td>
                  <td className="py-1 pr-2 break-all">{h.destinationUrl}</td>
                  <td className="py-1 pr-2">
                    {h.attempt}/{h.attemptsTotal}
                  </td>
                  <td className={`py-1 pr-2 ${STATUS_COLOR[h.status] ?? ""}`} title={h.error ?? undefined}>
                    {h.status}
                    {h.responseStatus ? ` ${h.responseStatus}` : ""}
                    {h.errorCode ? ` ${h.errorCode}` : ""}
                  </td>
                  <td className="py-1">{h.elapsedMs ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
