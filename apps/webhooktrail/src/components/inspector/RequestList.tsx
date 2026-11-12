"use client";

import { useEffect, useRef } from "react";
import { formatBytes, relativeTime } from "@/lib/format";
import { maskQueryString } from "@/lib/sensitive";
import type { RequestSummaryDTO } from "@/lib/types";
import { MethodBadge } from "../ui";

/**
 * Keyboard: the list is one tab stop (role=listbox). Arrow Up/Down or j/k move the selection,
 * Home/End jump, Enter opens the detail (on narrow screens).
 */
export function RequestList({
  requests,
  selectedId,
  freshIds,
  onSelect,
  onOpen,
  now,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  requests: RequestSummaryDTO[];
  selectedId: string | null;
  freshIds: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  now: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    const el = document.getElementById(`req-${selectedId}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (requests.length === 0) return;
    const idx = Math.max(0, requests.findIndex((r) => r.id === selectedId));
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "j") next = Math.min(requests.length - 1, idx + (selectedId ? 1 : 0));
    else if (e.key === "ArrowUp" || e.key === "k") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = requests.length - 1;
    else if (e.key === "Enter" && selectedId) {
      e.preventDefault();
      onOpen(selectedId);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      onSelect(requests[next]!.id);
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Captured requests, newest first"
        aria-activedescendant={selectedId ? `req-${selectedId}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex-1 min-h-0 overflow-y-auto focus-visible:outline-offset-[-2px]"
      >
        {requests.map((r) => {
          const selected = r.id === selectedId;
          return (
            <li
              key={r.id}
              id={`req-${r.id}`}
              role="option"
              aria-selected={selected}
              onClick={() => {
                onSelect(r.id);
                onOpen(r.id);
              }}
              className={`relative grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2 border-b border-line cursor-pointer select-none ${
                selected ? "bg-surface-3" : "hover:bg-surface-2"
              } ${freshIds.has(r.id) ? "wt-arrive" : ""}`}
            >
              {selected && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[2px] bg-signal" />}
              <MethodBadge method={r.method} />
              <span className="font-mono text-[12.5px] truncate min-w-0">
                {r.path}
                {r.query && <span className="text-fg-dim">?{maskQueryString(r.query)}</span>}
              </span>
              <span className="font-mono text-[11px] text-fg-dim tabular-nums text-right">{relativeTime(r.receivedAt, now)}</span>
              <span />
              <span className="font-mono text-[11px] text-fg-dim truncate">
                {formatBytes(r.bodySize)}
                {r.truncated && <span className="text-warn"> · truncated</span>}
                {r.contentType && <span> · {r.contentType.split(";")[0]}</span>}
              </span>
              <span className="font-mono text-[11px] text-fg-dim tabular-nums">{r.sourceIp}</span>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="p-2 border-t border-line">
          <button type="button" className="btn w-full justify-center" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older requests"}
          </button>
        </div>
      )}
    </div>
  );
}
