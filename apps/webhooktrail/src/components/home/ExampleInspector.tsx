"use client";

import { useState } from "react";
import { JsonTree } from "@/components/inspector/JsonTree";
import { CopyButton, MethodBadge } from "@/components/ui";
import { buildCurl } from "@/lib/curl";
import { displayHeaderValue, isSensitiveHeader } from "@/lib/sensitive";

/**
 * The home page's product visual: the inspector UI with static SAMPLE data, permanently labelled.
 * Nothing here is live and nothing "arrives"; selection, tabs, reveal and copy-as-cURL work on the sample.
 * It reuses the app's own JSON tree, method badges, secret masking and cURL builder.
 */
interface Sample {
  id: string;
  method: string;
  path: string;
  status: number;
  time: string;
  source: string;
  headers: [string, string][];
  body: unknown;
}

const SLUG = "example-7f2a";
const CAPTURE = `https://webhooktrail.com/h/${SLUG}`;

const SAMPLES: Sample[] = [
  {
    id: "s1",
    method: "POST",
    path: "/stripe/checkout",
    status: 200,
    time: "14:27:08",
    source: "Stripe",
    headers: [
      ["content-type", "application/json; charset=utf-8"],
      ["user-agent", "Stripe/1.0 (+https://stripe.com/docs/webhooks)"],
      ["stripe-signature", "t=1700000000,v1=example_signature_not_real"],
    ],
    body: { id: "evt_example_01", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_example_01", amount_total: 4900, currency: "usd", status: "complete" } } },
  },
  {
    id: "s2",
    method: "POST",
    path: "/github/events",
    status: 200,
    time: "14:26:41",
    source: "GitHub",
    headers: [
      ["content-type", "application/json"],
      ["x-github-event", "push"],
      ["x-hub-signature-256", "sha256=example_not_a_real_signature"],
    ],
    body: { ref: "refs/heads/main", repository: { full_name: "example-org/example-repo" }, commits: [{ id: "0000000", message: "Example commit" }] },
  },
  {
    id: "s3",
    method: "PUT",
    path: "/shopify/orders/42",
    status: 422,
    time: "14:25:17",
    source: "Shopify",
    headers: [
      ["content-type", "application/json"],
      ["x-shopify-topic", "orders/updated"],
      ["x-shopify-hmac-sha256", "example-not-a-real-hmac="],
    ],
    body: { id: 42, email: "customer@example.com", financial_status: "paid", line_items: [{ title: "Example item", quantity: 1 }] },
  },
  {
    id: "s4",
    method: "GET",
    path: "/ci/build/14",
    status: 200,
    time: "14:24:02",
    source: "CI",
    headers: [
      ["user-agent", "example-ci/2.1"],
      ["authorization", "Bearer example-token-not-real"],
    ],
    body: null,
  },
];

type Tab = "pretty" | "raw";

function StatusText({ code }: { code: number }) {
  const ok = code < 400;
  return (
    <span className={`num font-mono text-[11.5px] ${ok ? "text-ok" : "text-warn"}`}>
      <span aria-hidden="true">{ok ? "✓ " : "▲ "}</span>
      {code}
    </span>
  );
}

export function ExampleInspector() {
  const [sel, setSel] = useState(SAMPLES[0]!.id);
  const [tab, setTab] = useState<Tab>("pretty");
  const [reveal, setReveal] = useState(false);
  // Phones open on the selected request so the payload is visible on the first screen.
  const [mobileDetail, setMobileDetail] = useState(true);
  const r = SAMPLES.find((s) => s.id === sel)!;
  const bodyText = r.body === null ? null : JSON.stringify(r.body, null, 2);

  function onKey(e: React.KeyboardEvent) {
    const i = SAMPLES.findIndex((s) => s.id === sel);
    let n = -1;
    if (e.key === "ArrowDown" || e.key === "j") n = Math.min(SAMPLES.length - 1, i + 1);
    else if (e.key === "ArrowUp" || e.key === "k") n = Math.max(0, i - 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      setMobileDetail(true);
      return;
    }
    if (n >= 0) {
      e.preventDefault();
      setSel(SAMPLES[n]!.id);
    }
  }

  return (
    <div
      className="wt-in overflow-hidden rounded-[16px] border border-line-strong/70 bg-surface shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]"
      style={{ ["--d" as string]: "120ms" }}
      role="region"
      aria-label="Example inspector with sample data (not live)"
    >
      {/* Frame bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="label !text-signal">Example inspector</span>
        <span className="label">sample data · not live</span>
        <span className="ml-auto truncate font-mono text-[12px] text-fg-muted">/h/{SLUG}</span>
      </div>

      <div className="grid md:min-h-[520px] md:grid-cols-[34%_1fr]">
        {/* Request list */}
        <div className={`flex-col border-line md:flex md:border-r ${mobileDetail ? "hidden" : "flex"}`}>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[12px] font-semibold text-fg-muted">Requests · {SAMPLES.length}</span>
          </div>
          <ul role="listbox" aria-label="Sample requests" tabIndex={0} onKeyDown={onKey} aria-activedescendant={`ex-${sel}`} className="focus-visible:outline-offset-[-2px]">
            {SAMPLES.map((s) => {
              const on = s.id === sel;
              return (
                <li
                  key={s.id}
                  id={`ex-${s.id}`}
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    setSel(s.id);
                    setMobileDetail(true);
                  }}
                  className={`relative flex min-h-[68px] cursor-pointer flex-col justify-center border-t border-line px-[18px] py-3 transition-colors duration-150 ${on ? "bg-[#1b2732]" : "hover:bg-surface-2"}`}
                >
                  {on && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-signal" />}
                  <div className="flex items-center gap-2">
                    <MethodBadge method={s.method} className="!min-w-[3.25rem]" />
                    <span className="truncate text-[12.5px] font-semibold text-fg">{s.source}</span>
                    <span className="num ml-auto font-mono text-[11px] text-fg-faint">{s.time}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="truncate font-mono text-[12px] text-fg-muted">{s.path}</span>
                    <span className="ml-auto">
                      <StatusText code={s.status} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto hidden border-t border-line px-[18px] py-3 text-[12px] text-fg-faint md:block">
            <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> move · <kbd className="kbd">Enter</kbd> open
          </p>
        </div>

        {/* Detail */}
        <div className={`min-w-0 ${mobileDetail ? "" : "hidden md:block"}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-[18px] py-2.5 md:py-3">
            <button type="button" onClick={() => setMobileDetail(false)} className="btn btn-ghost -ml-2 h-10 w-full justify-start md:hidden">
              ← All {SAMPLES.length} sample requests
            </button>
            <MethodBadge method={r.method} />
            <span className="truncate font-mono text-[13px] text-fg">{r.path}</span>
            <span className="ml-auto flex items-center gap-3">
              <StatusText code={r.status} />
              <CopyButton
                className="btn h-8"
                label="Copy as cURL"
                text={() =>
                  buildCurl({
                    captureUrl: CAPTURE,
                    method: r.method,
                    path: r.path,
                    query: "",
                    headers: r.headers,
                    bodyText,
                    bodySize: bodyText?.length ?? 0,
                    truncated: false,
                    contentType: "application/json",
                    revealSecrets: false,
                  })
                }
              />
            </span>
          </div>

          <div className="px-[18px] pt-3">
            <div role="tablist" aria-label="Body view" className="flex gap-1 border-b border-line">
              {(
                [
                  ["pretty", r.body === null ? "No body" : "JSON tree"],
                  ["raw", "Raw"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`-mb-px h-11 border-b-2 px-3 text-[12.5px] font-semibold transition-colors ${tab === id ? "border-signal text-fg" : "border-transparent text-fg-dim hover:text-fg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="wt-scroll h-[236px] overflow-auto py-3 md:h-[282px]" tabIndex={0} aria-label="Sample body">
              {r.body === null ? (
                <p className="text-[13px] text-fg-dim">GET request: no body was sent.</p>
              ) : tab === "pretty" ? (
                <JsonTree value={r.body} openDepth={4} className="text-[13px] leading-5" />
              ) : (
                <pre className="whitespace-pre-wrap break-all font-mono text-[13px] leading-[21px] text-code">{JSON.stringify(r.body)}</pre>
              )}
            </div>
          </div>

          <div className="border-t border-line px-[18px] py-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-fg-muted">Headers · {r.headers.length}</span>
              <button type="button" onClick={() => setReveal((v) => !v)} className="btn btn-ghost h-7 text-[12px]" aria-pressed={reveal}>
                {reveal ? "Mask secrets" : "Reveal secrets"}
              </button>
            </div>
            <dl className="mt-2 grid gap-1.5">
              {r.headers.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,10.5rem)_1fr] gap-3 font-mono text-[12px]">
                  <dt className="truncate text-fg-dim">{k}</dt>
                  <dd className={`truncate ${isSensitiveHeader(k) && !reveal ? "text-signal" : "text-code"}`}>{displayHeaderValue(k, v, reveal)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
