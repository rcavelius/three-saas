"use client";

import { useRef, useState } from "react";
import { CLEANER_EVENTS } from "@/lib/cleaner-events";

/**
 * The homepage's first screen: drop a file, choose one, or load the sample. Files go straight to the Cleaner
 * further down the page (same tab, same browser) by window event; nothing is uploaded.
 */
export function HeroDrop({ limitText }: { limitText: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const send = (list: File[]) => {
    if (list.length) window.dispatchEvent(new CustomEvent<File[]>(CLEANER_EVENTS.files, { detail: list }));
  };
  return (
    <div
      className={`card-pop relative p-3 transition-colors duration-150 sm:p-4 ${over ? "!bg-mint" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        send(Array.from(e.dataTransfer.files));
      }}
    >
      <div className={`flex flex-col gap-3 rounded-[10px] border-[3px] border-dashed border-ink px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5 sm:py-5 ${over ? "bg-mint" : "bg-surface"}`}>
        <picture className="hidden shrink-0 sm:block">
          <source srcSet="/art/sheet.avif" type="image/avif" />
          <img src="/art/sheet.webp" alt="" width={62} height={80} decoding="async" className="h-auto w-[62px]" />
        </picture>
        <div className="min-w-0 flex-1 pr-24 sm:pr-0">
          <p className="text-[21px] font-extrabold leading-tight tracking-[-0.015em] sm:text-[24px]">Drop a CSV or Excel file</p>
          <p className="mt-1 text-[14px] font-medium text-ink-2">{limitText}</p>
        </div>
        <button type="button" className="btn-pop w-full shrink-0 sm:w-auto" onClick={() => input.current?.click()}>
          Choose a file
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose CSV or Excel files to clean"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            e.target.value = "";
            send(list);
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <button
          type="button"
          className="group inline-flex items-center gap-2 text-[17px] font-extrabold underline decoration-[3px] underline-offset-[5px] hover:decoration-pink"
          onClick={() => window.dispatchEvent(new Event(CLEANER_EVENTS.sample))}
        >
          Clean a messy sample file
          <svg className="transition-transform duration-200 group-hover:translate-x-1" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="chip">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c6ff3a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
          Never uploaded
        </p>
      </div>
    </div>
  );
}
