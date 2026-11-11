"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { timeUntil } from "@/lib/format";
import type { EndpointDTO, ResponseContentType } from "@/lib/types";

const EXPIRY_CHOICES = [1, 6, 12, 24];

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return (
    <p aria-live="polite" className={`text-[12.5px] min-h-[1.25rem] ${msg?.ok ? "text-ok" : "text-err"}`}>
      {msg?.text}
    </p>
  );
}

export function EndpointSettings({
  endpoint,
  onUpdated,
  onDeleted,
}: {
  endpoint: EndpointDTO;
  onUpdated: (e: EndpointDTO) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(endpoint.name);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState(String(endpoint.response.status));
  const [contentType, setContentType] = useState<ResponseContentType>(endpoint.response.contentType);
  const [body, setBody] = useState(endpoint.response.body ?? "");
  const [respMsg, setRespMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hours, setHours] = useState(24);
  const [expMsg, setExpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function patch(payload: unknown, set: (m: { ok: boolean; text: string }) => void, okText: string) {
    setBusy(true);
    try {
      const r = await api<{ endpoint: EndpointDTO }>(`/api/endpoints/${endpoint.id}`, { method: "PATCH", body: payload });
      onUpdated(r.endpoint);
      set({ ok: true, text: okText });
      return r.endpoint;
    } catch (e) {
      set({ ok: false, text: e instanceof ApiError ? e.message : "Request failed." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 max-w-2xl grid gap-8">
      <section aria-labelledby="s-name">
        <h2 id="s-name" className="text-[15px] font-semibold">
          Name
        </h2>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ name }, setNameMsg, "Saved.");
          }}
        >
          <label htmlFor="ep-name" className="sr-only">
            Endpoint name
          </label>
          <input id="ep-name" className="field flex-1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={busy || name.trim() === "" || name === endpoint.name}>
            Save
          </button>
        </form>
        <Status msg={nameMsg} />
      </section>

      <section aria-labelledby="s-resp">
        <h2 id="s-resp" className="text-[15px] font-semibold">
          Response
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          What the capture URL answers. Only <code className="font-mono">application/json</code> and{" "}
          <code className="font-mono">text/plain</code> are allowed (max 4 KB). An empty JSON body sends the default{" "}
          <code className="font-mono">{`{"ok":true,"id":"…"}`}</code>.
        </p>
        <form
          className="mt-3 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void patch(
              { response: { status: Number(status), contentType, body } },
              setRespMsg,
              "Saved. New requests get this response.",
            );
          }}
        >
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1">
              <span className="label">Status</span>
              <input
                className="field w-24 font-mono"
                inputMode="numeric"
                value={status}
                onChange={(e) => setStatus(e.target.value.replace(/\D/g, "").slice(0, 3))}
                aria-describedby="status-hint"
              />
            </label>
            <label className="grid gap-1">
              <span className="label">Content-Type</span>
              <select className="field font-mono" value={contentType} onChange={(e) => setContentType(e.target.value as ResponseContentType)}>
                <option value="application/json">application/json</option>
                <option value="text/plain">text/plain</option>
              </select>
            </label>
          </div>
          <p id="status-hint" className="text-[12px] text-fg-dim -mt-1">
            200 to 599. 204, 205 and 304 must have an empty body.
          </p>
          <label className="grid gap-1">
            <span className="label">Body</span>
            <textarea className="field font-mono text-[12.5px] min-h-28" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-signal" disabled={busy}>
              Save response
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                const ep = await patch({ response: null }, setRespMsg, "Reset to the default response.");
                if (ep) {
                  setStatus("200");
                  setContentType("application/json");
                  setBody("");
                }
              }}
            >
              Reset to default
            </button>
          </div>
        </form>
        <Status msg={respMsg} />
      </section>

      <section aria-labelledby="s-exp">
        <h2 id="s-exp" className="text-[15px] font-semibold">
          Expiry
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Expires in <span className="font-mono text-fg">{timeUntil(endpoint.expiresAt)}</span>. Free endpoints can be set to at most{" "}
          {endpoint.limits.retentionHours} hours from now and live no longer than 7 days in total (until{" "}
          {new Date(endpoint.limits.maxExpiresAt).toLocaleString()}). Expired endpoints and their requests are deleted.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ expiresInHours: hours }, setExpMsg, "Expiry updated.");
          }}
        >
          <label htmlFor="ep-exp" className="sr-only">
            Expire in
          </label>
          <select id="ep-exp" className="field" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {EXPIRY_CHOICES.filter((h) => h <= endpoint.limits.retentionHours).map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? "" : "s"} from now
              </option>
            ))}
          </select>
          <button className="btn" disabled={busy}>
            Set expiry
          </button>
        </form>
        <Status msg={expMsg} />
      </section>

      <section aria-labelledby="s-del" className="border border-err/30 rounded-[6px] p-4">
        <h2 id="s-del" className="text-[15px] font-semibold text-err">
          Delete endpoint
        </h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          The capture URL stops working immediately and all captured requests are deleted. This cannot be undone.
        </p>
        <div className="mt-3 flex gap-2">
          {!confirmDelete ? (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete endpoint…
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                autoFocus
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/api/endpoints/${endpoint.id}`, { method: "DELETE" });
                    onDeleted();
                  } catch {
                    setBusy(false);
                  }
                }}
              >
                Yes, delete it and its requests
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
