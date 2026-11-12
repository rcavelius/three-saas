"use client";

import { useMemo, useState } from "react";
import { decodeForm, formatBytes, hexDump, isFormType, isJsonType, tryParseJson } from "@/lib/format";
import { maskBodyText, maskJson } from "@/lib/mask-body";
import { CopyButton } from "../ui";
import { JsonTree } from "./JsonTree";

type Tab = "pretty" | "raw" | "hex";

export function BodyViewer({
  bytes,
  text,
  contentType,
  bodySize,
  truncated,
  bodyBase64,
  reveal = false,
  onReveal,
}: {
  bytes: Uint8Array;
  text: string | null;
  contentType: string | null;
  bodySize: number;
  truncated: boolean;
  bodyBase64: string;
  /** When false, secret-like fields (password, token, api_key, card numbers...) are masked. */
  reveal?: boolean;
  onReveal?: () => void;
}) {
  const binary = text === null;
  const looksJson = !binary && (isJsonType(contentType) || /^\s*[[{]/.test(text));
  const parsed = useMemo(() => (looksJson && text !== null ? tryParseJson(text) : null), [looksJson, text]);
  const masked = useMemo(() => (text === null ? null : maskBodyText(text, contentType)), [text, contentType]);
  const secretCount = masked?.count ?? 0;
  const hide = !reveal && secretCount > 0;
  const json = useMemo(
    () => (parsed && parsed.ok && hide ? { ok: true as const, value: maskJson(parsed.value).value } : parsed),
    [parsed, hide],
  );
  const shownText = hide ? masked!.text : text;
  const form = shownText !== null && isFormType(contentType) ? decodeForm(shownText) : null;
  const [tab, setTab] = useState<Tab>(binary ? "hex" : "pretty");

  if (bodySize === 0) {
    return <p className="text-[13px] text-fg-dim px-4 py-3">No body.</p>;
  }

  const tabs: { id: Tab; label: string }[] = binary
    ? [{ id: "hex", label: "Hex" }]
    : [
        { id: "pretty", label: json?.ok ? "JSON tree" : form ? "Form fields" : "Text" },
        { id: "raw", label: "Raw" },
        { id: "hex", label: "Hex" },
      ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-line">
        <div role="tablist" aria-label="Body view" className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`h-7 px-2.5 rounded-[3px] font-mono text-[11.5px] ${
                tab === t.id ? "bg-surface-3 text-fg border border-line-strong" : "text-fg-muted hover:text-fg border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[11.5px] text-fg-dim">
          {formatBytes(bodySize)}
          {truncated && ` · stored ${formatBytes(bytes.byteLength)}`}
        </span>
        <div className="ml-auto">
          <CopyButton
            className="btn h-7"
            label={binary ? "Copy body (base64)" : hide ? "Copy body (masked)" : "Copy body"}
            text={() => (binary ? bodyBase64 : (shownText ?? ""))}
          />
        </div>
      </div>
      {hide && (
        <p className="mx-4 mt-3 text-[12.5px] text-fg-muted">
          {secretCount} secret-looking field{secretCount === 1 ? " is" : "s are"} masked.{" "}
          {onReveal && (
            <button type="button" className="text-signal underline underline-offset-2" onClick={onReveal}>
              Reveal for this view
            </button>
          )}
        </p>
      )}
      {truncated && (
        <p className="mx-4 mt-3 px-3 py-2 border border-warn/40 bg-warn/5 rounded-[4px] text-[12.5px] text-warn">
          Body truncated: {formatBytes(bodySize)} received, the first {formatBytes(bytes.byteLength)} were stored.
        </p>
      )}
      {json && !json.ok && tab === "pretty" && (
        <p className="mx-4 mt-3 px-3 py-2 border border-err/40 bg-err/5 rounded-[4px] text-[12.5px] text-err">
          Not valid JSON{truncated ? " (possibly because it was truncated)" : ""}: {json.error}
        </p>
      )}
      {binary && (
        <p className="mx-4 mt-3 text-[12.5px] text-fg-muted">
          Binary body (not valid UTF-8 text). Showing a hex dump of the first {formatBytes(Math.min(bytes.byteLength, 4096))}. Use
          Copy body to get the full stored bytes as base64.
        </p>
      )}
      <div role="tabpanel" className="px-4 py-3 overflow-auto max-h-[70vh]">
        {tab === "pretty" && json?.ok && <JsonTree value={json.value} />}
        {tab === "pretty" && !json?.ok && form && (
          <table className="w-full text-[12.5px] font-mono">
            <tbody>
              {form.map(([k, v], i) => (
                <tr key={i} className="border-b border-line align-top">
                  <th scope="row" className="text-left font-normal text-fg-muted py-1.5 pr-4 break-all max-w-[40%] w-1">
                    {k}
                  </th>
                  <td className="py-1.5 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {((tab === "pretty" && !json?.ok && !form) || tab === "raw") && (
          <pre className="font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap break-all">{shownText}</pre>
        )}
        {tab === "hex" && hide && <p className="text-[12.5px] text-fg-muted">The hex view shows raw bytes, so it is hidden while secrets are masked.</p>}
        {tab === "hex" && !hide && <pre className="font-mono text-[12px] leading-[1.6] text-fg-muted whitespace-pre">{hexDump(bytes)}</pre>}
      </div>
    </div>
  );
}
