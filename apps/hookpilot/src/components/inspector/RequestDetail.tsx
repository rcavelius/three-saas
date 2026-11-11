"use client";

import { useMemo, useState } from "react";
import { buildCurl } from "@/lib/curl";
import { base64ToBytes, decodeText, formatBytes, parseQuery, relativeTime } from "@/lib/format";
import { displayHeaderValue, isSensitiveHeader, isSensitiveQueryKey, MASK, maskQueryString } from "@/lib/sensitive";
import type { RequestDetailDTO } from "@/lib/types";
import { CopyButton, MethodBadge } from "../ui";
import { BodyViewer } from "./BodyViewer";

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-b border-line">
      <h3 className="label px-4 pt-3 pb-2 flex items-center gap-2">
        {title}
        {count !== undefined && <span className="text-fg-dim normal-case tracking-normal">({count})</span>}
      </h3>
      {children}
    </section>
  );
}

export function RequestDetail({
  request,
  captureUrl,
  onDelete,
  now,
}: {
  request: RequestDetailDTO;
  captureUrl: string;
  onDelete: () => void;
  now: number;
}) {
  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const bytes = useMemo(() => base64ToBytes(request.bodyBase64), [request.bodyBase64]);
  const text = useMemo(() => decodeText(bytes, request.truncated), [bytes, request.truncated]);
  const query = parseQuery(request.query);
  const shownQuery = revealAll ? request.query : maskQueryString(request.query);
  const sensitiveCount =
    request.headers.filter(([k]) => isSensitiveHeader(k)).length + query.filter(([k]) => isSensitiveQueryKey(k)).length;
  const isRevealed = (key: string) => revealAll || revealed.has(key);
  const toggle = (key: string) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const curl = () =>
    buildCurl({
      captureUrl,
      method: request.method,
      path: request.path,
      query: request.query,
      headers: request.headers,
      bodyText: text,
      bodySize: request.bodySize,
      truncated: request.truncated,
      revealSecrets: revealAll,
    });

  return (
    <article aria-label={`${request.method} ${request.path}`} className="min-w-0">
      <header className="px-4 py-3 border-b border-line">
        <div className="flex items-start gap-3 min-w-0">
          <MethodBadge method={request.method} className="mt-0.5 shrink-0" />
          <h2 className="font-mono text-[13.5px] leading-6 break-all min-w-0">
            {request.path}
            {shownQuery && <span className="text-fg-dim">?{shownQuery.length > 200 ? `${shownQuery.slice(0, 200)}…` : shownQuery}</span>}
          </h2>
        </div>
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 font-mono text-[11.5px]">
          <div>
            <dt className="text-fg-dim">received</dt>
            <dd title={request.receivedAt}>
              {new Date(request.receivedAt).toLocaleTimeString()} · {relativeTime(request.receivedAt, now)}
            </dd>
          </div>
          <div>
            <dt className="text-fg-dim">size</dt>
            <dd>
              {formatBytes(request.bodySize)}
              {request.truncated && <span className="text-warn"> (truncated)</span>}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-fg-dim">content-type</dt>
            <dd className="truncate">{request.contentType ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-fg-dim">source ip</dt>
            <dd>{request.sourceIp ?? "—"}</dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton className="btn h-7" label={revealAll ? "Copy as cURL (with secrets)" : "Copy as cURL"} text={curl} />
          {sensitiveCount > 0 && (
            <button type="button" className="btn h-7" aria-pressed={revealAll} onClick={() => setRevealAll((v) => !v)}>
              {revealAll ? "Mask secrets" : `Reveal ${sensitiveCount} secret${sensitiveCount === 1 ? "" : "s"}`}
            </button>
          )}
          <button type="button" className="btn btn-danger h-7 ml-auto" onClick={onDelete}>
            Delete request
          </button>
        </div>
      </header>

      {query.length > 0 && (
        <Section title="Query" count={query.length}>
          <table className="w-full font-mono text-[12.5px]">
            <tbody>
              {query.map(([k, v], i) => {
                const secret = isSensitiveQueryKey(k);
                const key = `q:${i}`;
                return (
                  <tr key={key} className="border-t border-line align-top">
                    <th scope="row" className="text-left font-normal text-fg-muted py-1.5 pl-4 pr-4 whitespace-nowrap w-1">
                      {k}
                    </th>
                    <td className="py-1.5 pr-4 break-all">
                      {secret && !isRevealed(key) ? <span className="text-fg-dim">{MASK}</span> : v}
                      {secret && (
                        <button type="button" className="ml-2 text-[11px] text-signal underline underline-offset-2" onClick={() => toggle(key)}>
                          {isRevealed(key) ? "hide" : "reveal"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Headers" count={request.headers.length}>
        <table className="w-full font-mono text-[12.5px]">
          <tbody>
            {request.headers.map(([k, v], i) => {
              const secret = isSensitiveHeader(k);
              const key = `h:${i}`;
              return (
                <tr key={key} className="border-t border-line align-top">
                  <th scope="row" className="text-left font-normal text-fg-muted py-1.5 pl-4 pr-4 whitespace-nowrap w-1">
                    {k}
                  </th>
                  <td className="py-1.5 pr-4 break-all">
                    <span className={secret && !isRevealed(key) ? "text-fg-dim" : undefined}>{displayHeaderValue(k, v, isRevealed(key))}</span>
                    {secret && (
                      <button
                        type="button"
                        className="ml-2 text-[11px] text-signal underline underline-offset-2"
                        aria-label={`${isRevealed(key) ? "Hide" : "Reveal"} ${k}`}
                        onClick={() => toggle(key)}
                      >
                        {isRevealed(key) ? "hide" : "reveal"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11.5px] text-fg-dim">Header names are lower-cased and listed alphabetically by the runtime.</p>
      </Section>

      <Section title="Body">
        <BodyViewer
          key={request.id}
          bytes={bytes}
          text={text}
          contentType={request.contentType}
          bodySize={request.bodySize}
          truncated={request.truncated}
          bodyBase64={request.bodyBase64}
        />
      </Section>
    </article>
  );
}
