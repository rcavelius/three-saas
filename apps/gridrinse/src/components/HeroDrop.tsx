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
      className={`card-pop mt-7 p-4 sm:p-5 ${over ? "!bg-mint" : ""}`}
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
      <div className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent px-4 py-5 text-center sm:flex-row sm:text-left ${over ? "bg-mint" : "bg-mint-soft"}`}>
        <svg className="hidden shrink-0 sm:block" width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
          <path d="M14 2.5V8h5.5M12 17.5v-6M9.2 14.2 12 11.4l2.8 2.8" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[20px] font-extrabold tracking-[-0.01em] sm:text-[22px]">Drop a CSV or Excel file here</p>
          <p className="text-[14px] font-medium text-ink-2">{limitText}</p>
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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[16px] font-extrabold">No file handy?</p>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-[17px] font-extrabold underline decoration-2 underline-offset-4"
          onClick={() => window.dispatchEvent(new Event(CLEANER_EVENTS.sample))}
        >
          Clean a messy sample file
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
