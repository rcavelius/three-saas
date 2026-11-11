"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface DataGridProps {
  columns: string[];
  rows: string[][];
  caption: string;
  /** 1-based row numbers to show in the gutter (e.g. original line numbers). */
  rowNumbers?: number[];
  /** Indices into `rows` to display (filtering); defaults to all. */
  visible?: number[];
  isChanged?: (row: number, col: number) => boolean;
  originalValue?: (row: number, col: number) => string | undefined;
  showOriginal?: boolean;
  /** Per-column header note, e.g. "new" or the old name. */
  headerNotes?: (string | null)[];
  extraColumn?: { label: string; values: string[] };
  tone?: "normal" | "removed";
  pageSize?: number;
  /** Make invisible characters visible (leading/trailing spaces, NBSP, zero-width). */
  revealWhitespace?: boolean;
}

const INVISIBLE_RE = /[ ​‌‍⁠﻿ ]/;

/** Render a cell, making whitespace problems visible so you can see what cleaning will fix. */
export function CellText({ value, reveal }: { value: string; reveal: boolean }): ReactNode {
  if (!reveal || value === "") return value;
  const lead = value.match(/^[ \t]+/)?.[0] ?? "";
  const trail = lead.length === value.length ? "" : (value.match(/[ \t]+$/)?.[0] ?? "");
  const core = value.slice(lead.length, value.length - trail.length);
  const hasInvisible = INVISIBLE_RE.test(core) || /\s{2,}|\n/.test(core);
  if (!lead && !trail && !hasInvisible) return value;
  const parts: ReactNode[] = [];
  const dots = (s: string, key: string) => (
    <span key={key} className="text-mark-edge" title={`${s.length} space(s)`}>
      {"·".repeat(s.length)}
    </span>
  );
  if (lead) parts.push(dots(lead, "l"));
  let buf = "";
  let k = 0;
  const flush = () => {
    if (buf) parts.push(buf);
    buf = "";
  };
  for (const ch of core) {
    if (ch === " " || ch === " ") {
      flush();
      parts.push(
        <span key={`i${k++}`} className="mx-px rounded-sm bg-mark px-0.5 text-[10px] text-mark-edge" title="non-breaking space">
          nb
        </span>,
      );
    } else if (/[​‌‍⁠﻿]/.test(ch)) {
      flush();
      parts.push(
        <span key={`i${k++}`} className="mx-px rounded-sm bg-mark px-0.5 text-[10px] text-mark-edge" title="zero-width character">
          zw
        </span>,
      );
    } else if (ch === "\n") {
      flush();
      parts.push(
        <span key={`i${k++}`} className="text-ink-3" title="line break">
          ↵
        </span>,
      );
    } else buf += ch;
  }
  flush();
  if (trail) parts.push(dots(trail, "t"));
  return <>{parts}</>;
}

export function DataGrid({
  columns,
  rows,
  caption,
  rowNumbers,
  visible,
  isChanged,
  originalValue,
  showOriginal = false,
  headerNotes,
  extraColumn,
  tone = "normal",
  pageSize = 100,
  revealWhitespace = false,
}: DataGridProps) {
  const indices = useMemo(() => visible ?? rows.map((_, i) => i), [visible, rows]);
  const pages = Math.max(1, Math.ceil(indices.length / pageSize));
  const [page, setPage] = useState(0);
  const current = Math.min(page, pages - 1);
  const slice = indices.slice(current * pageSize, current * pageSize + pageSize);

  if (columns.length === 0) {
    return <p className="px-4 py-6 text-sm text-ink-3">This table has no columns.</p>;
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="relative max-h-[62vh] min-h-[180px] overflow-auto border border-rule bg-surface" tabIndex={0} role="region" aria-label={caption}>
        <table className="w-max min-w-full border-collapse font-mono text-[12.5px] leading-5">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10">
            <tr>
              <th scope="col" className="sticky left-0 z-20 border-b border-r border-rule-strong bg-sunken px-2 py-1.5 text-right text-[11px] font-normal text-ink-3">
                <span className="sr-only">Row</span>#
              </th>
              {extraColumn && (
                <th scope="col" className="border-b border-r border-rule-strong bg-sunken px-2 py-1.5 text-left font-sans text-xs font-semibold text-ink-2">
                  {extraColumn.label}
                </th>
              )}
              {columns.map((c, i) => (
                <th key={i} scope="col" className="max-w-[28ch] border-b border-r border-rule-strong bg-sunken px-2 py-1.5 text-left align-bottom font-sans text-xs font-semibold text-ink">
                  <span className="block truncate" title={c}>
                    {c === "" ? <span className="text-ink-3">(blank)</span> : c}
                  </span>
                  {headerNotes?.[i] && <span className="block truncate text-[10.5px] font-normal text-ink-3">{headerNotes[i]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1 + (extraColumn ? 1 : 0)} className="px-3 py-6 text-center font-sans text-sm text-ink-3">
                  No rows to show.
                </td>
              </tr>
            )}
            {slice.map((r) => {
              const row = rows[r]!;
              return (
                <tr key={r} className={tone === "removed" ? "bg-del/60" : "even:bg-paper/60"}>
                  <th scope="row" className="sticky left-0 border-b border-r border-rule bg-sunken px-2 text-right text-[11px] font-normal text-ink-3">
                    {rowNumbers?.[r] ?? r + 1}
                  </th>
                  {extraColumn && <td className="border-b border-r border-rule px-2 font-sans text-xs text-del-ink">{extraColumn.values[r]}</td>}
                  {columns.map((_, c) => {
                    const value = row[c] ?? "";
                    const changed = isChanged?.(r, c) ?? false;
                    const before = changed && showOriginal ? originalValue?.(r, c) : undefined;
                    return (
                      <td
                        key={c}
                        className={`max-w-[32ch] border-b border-r border-rule px-2 py-0.5 align-top whitespace-pre ${changed ? "bg-mark shadow-[inset_2px_0_0_var(--color-mark-edge)]" : ""}`}
                        title={changed && originalValue ? `Was: ${originalValue(r, c) ?? "(new)"}` : value.length > 30 ? value : undefined}
                      >
                        {before !== undefined && (
                          <span className={`block truncate text-ink-3 ${before === "" ? "italic" : "line-through decoration-ink-3/60"}`}>
                            {before === "" ? "(was empty)" : <CellText value={before} reveal />}
                          </span>
                        )}
                        <span className="block truncate">
                          <CellText value={value} reveal={revealWhitespace} />
                        </span>
                        {changed && <span className="sr-only"> (changed{originalValue ? `, was ${originalValue(r, c) || "empty"}` : ""})</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-x border-b border-rule bg-sunken px-3 py-1.5 text-xs text-ink-2">
        <span className="font-mono">
          {indices.length === 0 ? "0 rows" : `Rows ${current * pageSize + 1}–${Math.min(indices.length, (current + 1) * pageSize)} of ${indices.length.toLocaleString("en-US")}`}
          {" · "}
          {columns.length} columns
        </span>
        {pages > 1 && (
          <span className="flex items-center gap-1">
            <button type="button" className="btn btn-sm" onClick={() => setPage(0)} disabled={current === 0} aria-label="First page">
              «
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
              Prev
            </button>
            <span className="px-1 font-mono" aria-live="polite">
              {current + 1}/{pages}
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
              Next
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPage(pages - 1)} disabled={current >= pages - 1} aria-label="Last page">
              »
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
