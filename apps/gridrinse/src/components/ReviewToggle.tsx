"use client";

import { useState } from "react";

/** Before/After switch on the "Review every change" card: changed cells are highlighted, as in the cleaner. */
export function ReviewToggle({ columns, before, after }: { columns: string[]; before: string[]; after: string[] }) {
  const [view, setView] = useState<"before" | "after">("before");
  const row = view === "before" ? before : after;
  return (
    <div>
      <div role="group" aria-label="Show the row before or after cleaning" className="mx-auto flex w-fit overflow-hidden rounded-lg border-2 border-ink text-[15px] font-bold">
        {(["before", "after"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`min-w-[6.5rem] px-4 py-1 capitalize ${view === v ? "bg-accent text-white" : "bg-surface hover:bg-sunken"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <table className="mt-3 w-full border-collapse whitespace-pre text-[15px]">
        <thead>
          <tr className="bg-sunken">
            {columns.map((c) => (
              <th key={c} scope="col" className="border-2 border-ink px-3 py-1 text-left font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {row.map((c, i) => (
              <td key={i} className={`border-2 border-ink px-3 py-1 font-medium ${before[i] !== after[i] ? (view === "before" ? "bg-rose" : "bg-mint-soft") : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
