"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";

interface Sample {
  id: string;
  label: string;
  note: string;
  method: string;
  path: string;
  contentType: string;
  headers?: Record<string, string>;
  body: () => string;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SAMPLES: Sample[] = [
  {
    id: "json",
    label: "JSON event: order.created",
    note: "A generic webhook event with a signature header (masked in the inspector until you reveal it).",
    method: "POST",
    path: "/webhooks/orders",
    contentType: "application/json",
    headers: { "X-Event-Type": "order.created", "X-Webhook-Signature": `sha256=${randomHex(32)}` },
    body: () =>
      JSON.stringify(
        {
          id: `evt_${randomHex(8)}`,
          type: "order.created",
          created: Math.floor(Date.now() / 1000),
          data: {
            order: {
              id: `ord_${randomHex(6)}`,
              currency: "EUR",
              total: 4280,
              items: [
                { sku: "TSHIRT-BLK-M", qty: 2, unit_price: 1490 },
                { sku: "MUG-01", qty: 1, unit_price: 1300 },
              ],
              customer: { email: "test@example.com", country: "DE" },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "form",
    label: "Form post (urlencoded)",
    note: "A classic HTML-form style body; the inspector decodes it into fields.",
    method: "POST",
    path: "/forms/signup",
    contentType: "application/x-www-form-urlencoded",
    body: () => new URLSearchParams({ name: "Ada Lovelace", email: "ada@example.com", plan: "developer", agree: "on" }).toString(),
  },
  {
    id: "text",
    label: "Plain text",
    note: "A text/plain notification body.",
    method: "PUT",
    path: "/ci/status",
    contentType: "text/plain",
    body: () => `build 1482 finished: 312 passed, 0 failed (${new Date().toISOString()})`,
  },
  {
    id: "oversized",
    label: "Oversized payload (1.1 MB)",
    note: "Exceeds the 1 MB limit, so the capture URL answers 413 and nothing is stored.",
    method: "POST",
    path: "/upload",
    contentType: "text/plain",
    body: () => "x".repeat(1_150_000),
  },
  {
    id: "malformed",
    label: "Malformed JSON",
    note: "Declares application/json but the body is cut off; the inspector shows the parse error and the raw text.",
    method: "POST",
    path: "/webhooks/orders",
    contentType: "application/json",
    body: () => '{"type": "order.created", "data": {"order": {"id": "ord_1042", "total": 4280,',
  },
];

interface Result {
  status: number;
  ms: number;
  body: string;
  sent: number;
}

/** Sends a sample from this browser to the user's own capture URL (a real capture, no server-side outbound call). */
export function TestPayloads({ captureUrl, onSent }: { captureUrl: string; onSent: () => void }) {
  const [sampleId, setSampleId] = useState(SAMPLES[0]!.id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sample = SAMPLES.find((s) => s.id === sampleId)!;

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    const body = sample.body();
    const started = performance.now();
    try {
      const res = await fetch(`${captureUrl}${sample.path}?source=test-payload`, {
        method: sample.method,
        headers: { "Content-Type": sample.contentType, ...sample.headers },
        body,
        credentials: "omit",
        cache: "no-store",
      });
      const text = await res.text();
      setResult({ status: res.status, ms: Math.round(performance.now() - started), body: text.slice(0, 600), sent: new TextEncoder().encode(body).byteLength });
      onSent();
    } catch {
      setError("The request could not be sent (network error).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="test-title" className="p-4 max-w-2xl">
      <h2 id="test-title" className="text-[15px] font-semibold">
        Send a test payload
      </h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        Your browser sends the request straight to this endpoint&apos;s capture URL, exactly like an external sender would.
      </p>
      <fieldset className="mt-4 grid gap-1.5">
        <legend className="label mb-2">Sample</legend>
        {SAMPLES.map((s) => (
          <label
            key={s.id}
            className={`flex items-start gap-3 px-3 py-2 rounded-[4px] border cursor-pointer ${
              s.id === sampleId ? "border-signal/60 bg-surface-2" : "border-line hover:bg-surface-2"
            }`}
          >
            <input type="radio" name="sample" value={s.id} checked={s.id === sampleId} onChange={() => setSampleId(s.id)} className="mt-1 accent-[var(--color-signal)]" />
            <span>
              <span className="text-[13.5px] font-medium">{s.label}</span>
              <span className="block text-[12.5px] text-fg-muted">{s.note}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mt-3 font-mono text-[12px] text-fg-dim break-all">
        {sample.method} {captureUrl}
        {sample.path}?source=test-payload · {sample.contentType}
      </p>
      <button type="button" className="btn btn-signal mt-3" onClick={send} disabled={busy}>
        {busy ? "Sending…" : "Send"}
      </button>
      <div aria-live="polite" className="mt-4">
        {error && <p className="text-[13px] text-err">{error}</p>}
        {result && (
          <div className="border border-line rounded-[4px] bg-surface">
            <p className="px-3 py-2 border-b border-line font-mono text-[12px] flex flex-wrap gap-x-4">
              <span className={result.status < 300 ? "text-ok" : result.status === 413 ? "text-warn" : "text-err"}>HTTP {result.status}</span>
              <span className="text-fg-dim">{result.ms} ms</span>
              <span className="text-fg-dim">sent {formatBytes(result.sent)}</span>
            </p>
            <pre className="px-3 py-2 font-mono text-[12px] whitespace-pre-wrap break-all text-fg-muted">{result.body || "(empty response body)"}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
