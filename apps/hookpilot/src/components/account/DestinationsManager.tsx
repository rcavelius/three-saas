"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { DestinationDTO } from "@/lib/types";

export function DestinationsManager({ canManage, replayEnabled }: { canManage: boolean; replayEnabled: boolean }) {
  const [list, setList] = useState<DestinationDTO[] | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api<{ destinations: DestinationDTO[] }>("/api/destinations")).destinations);
    } catch {
      setList([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const fail = (e: unknown, fallback: string) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : fallback });

  async function verify(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const r = await api<{ verified: boolean; error: string | null }>(`/api/destinations/${id}/verify`, { method: "POST", body: {} });
      setMsg(r.verified ? { ok: true, text: "Verified. Replays can now be sent to this destination." } : { ok: false, text: `Not verified: ${r.error}` });
    } catch (e) {
      fail(e, "Verification failed.");
    } finally {
      setBusyId(null);
      void load();
    }
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="d-how" className="text-[13px] text-fg-muted grid gap-2">
        <h2 id="d-how" className="text-[16px] font-semibold text-fg">
          How verification works
        </h2>
        <p>
          Replays only go to destinations your workspace has verified. When you click Verify, HookPilot sends a POST with{" "}
          <code className="font-mono text-fg">{`{"type":"hookpilot.verify","challenge":"<random>"}`}</code> to the URL. Your endpoint must answer
          with a 2xx status and the challenge in the body, either as the bare string or as{" "}
          <code className="font-mono text-fg">{`{"challenge":"<random>"}`}</code>. Redirects are not followed. Changing the URL clears the
          verification.
        </p>
        <p>Only public HTTPS/HTTP addresses on ports 443/80 are allowed; private networks, cloud metadata and HookPilot itself are refused.</p>
      </section>

      {!replayEnabled && (
        <p className="text-[13px] text-warn">
          Replay is part of the Developer and Pro plans. <a className="underline underline-offset-2" href="/account/billing">Upgrade</a> to add
          destinations.
        </p>
      )}

      <section aria-labelledby="d-list">
        <h2 id="d-list" className="text-[16px] font-semibold">
          Destinations
        </h2>
        {list === null ? (
          <p className="mt-2 font-mono text-[12px] text-fg-dim">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-2 text-[13px] text-fg-muted">None yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border border-line rounded-[6px]">
            {list.map((d) => (
              <li key={d.id} className="px-3 py-2.5 grid gap-1.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{d.name}</span>
                  <span className="font-mono text-[12px] text-fg-muted break-all">{d.url}</span>
                  <span className={`ml-auto font-mono text-[12px] ${d.verified ? "text-ok" : "text-warn"}`}>
                    {d.verified ? `verified ${new Date(d.verifiedAt!).toLocaleDateString()}` : "not verified"}
                  </span>
                </div>
                {d.lastVerificationError && !d.verified && <p className="text-[12px] text-err">Last attempt: {d.lastVerificationError}</p>}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn h-7" disabled={busyId === d.id || !replayEnabled} onClick={() => void verify(d.id)}>
                      {busyId === d.id ? "Verifying…" : d.verified ? "Re-verify" : "Verify"}
                    </button>
                    {editing?.id === d.id ? (
                      <form
                        className="flex flex-wrap gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          try {
                            await api(`/api/destinations/${d.id}`, { method: "PATCH", body: { url: editing.url } });
                            setMsg({ ok: true, text: "URL changed: verify it again before replaying." });
                            setEditing(null);
                          } catch (err) {
                            fail(err, "Could not save.");
                          }
                          void load();
                        }}
                      >
                        <label className="sr-only" htmlFor={`edit-${d.id}`}>
                          New URL
                        </label>
                        <input
                          id={`edit-${d.id}`}
                          className="field h-7 w-[24rem] max-w-full font-mono"
                          value={editing.url}
                          onChange={(e) => setEditing({ id: d.id, url: e.target.value })}
                        />
                        <button className="btn h-7">Save</button>
                        <button type="button" className="btn btn-ghost h-7" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button type="button" className="btn btn-ghost h-7" onClick={() => setEditing({ id: d.id, url: d.url })}>
                        Change URL
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger h-7"
                      onClick={async () => {
                        try {
                          await api(`/api/destinations/${d.id}`, { method: "DELETE" });
                        } catch (err) {
                          fail(err, "Could not delete.");
                        }
                        void load();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <section aria-labelledby="d-add">
          <h2 id="d-add" className="text-[16px] font-semibold">
            Add a destination
          </h2>
          <form
            className="mt-3 flex flex-wrap gap-2 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              setMsg(null);
              try {
                await api("/api/destinations", { method: "POST", body: { name, url } });
                setName("");
                setUrl("");
                setMsg({ ok: true, text: "Added. Now verify it." });
              } catch (err) {
                fail(err, "Could not add the destination.");
              }
              void load();
            }}
          >
            <label className="grid gap-1 text-[13px]">
              <span className="text-fg-muted">Name</span>
              <input className="field h-9" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="grid gap-1 text-[13px] flex-1 min-w-[16rem]">
              <span className="text-fg-muted">URL</span>
              <input
                className="field h-9 font-mono"
                required
                type="url"
                placeholder="https://staging.example.com/webhooks/stripe"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <button className="btn btn-signal h-9" disabled={!replayEnabled}>
              Add destination
            </button>
          </form>
        </section>
      ) : (
        <p className="text-[13px] text-fg-muted">Only workspace owners and admins can add, change or verify destinations.</p>
      )}
      <p aria-live="polite" className={`text-[12.5px] min-h-[1.25rem] ${msg?.ok ? "text-ok" : "text-err"}`}>
        {msg?.text}
      </p>
    </div>
  );
}
