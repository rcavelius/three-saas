"use client";

import { CLEANER_EVENTS } from "@/lib/cleaner-events";

/** Hero calls to action: open the file picker of the Cleaner below, or load its sample file and scroll to it. */
export function HeroActions() {
  const scrollToCleaner = () => document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
      <button type="button" className="btn-pop" onClick={() => window.dispatchEvent(new Event(CLEANER_EVENTS.choose))}>
        Clean my spreadsheet
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
      <a
        href="#start"
        className="text-[17px] font-extrabold underline decoration-2 underline-offset-4 hover:decoration-[3px]"
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(new Event(CLEANER_EVENTS.sample));
          scrollToCleaner();
        }}
      >
        Try a sample file
      </a>
    </div>
  );
}
