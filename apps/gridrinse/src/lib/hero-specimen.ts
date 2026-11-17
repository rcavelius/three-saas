import { runPipeline } from "@/lib/engine/pipeline";
import { makeStep } from "@/lib/engine/schema";

/**
 * The before/after cards are produced by the real engine at render time, so what the hero shows is exactly
 * what the cleaner does: nothing in the "after" card is hand-written output.
 */
export function heroSpecimen() {
  const input = {
    columns: ["Customer", "Date", "Amount"],
    rows: [
      ["Maria Lopez", "Jan 17, 2024", "$1,234.50"],
      ["Ethan Clark", "1/15/2024", "(45.00)"],
      ["Maria Lopez ", "Jan 17, 2024", "$1,234.50"],
    ],
  };
  const res = runPipeline(input, [
    makeStep({ type: "trim" }),
    makeStep({ type: "removeBlankRows" }),
    makeStep({ type: "dedupe" }),
    makeStep({ type: "formatDates" }),
    makeStep({ type: "formatNumbers", columns: ["Amount"], decimals: 2 }),
  ]);
  const removedRows = input.rows.map((_, i) => i).filter((i) => !res.rowOrigins.includes(i));
  const trimmed = input.rows.some((r) => r.some((c) => c !== c.trim()));
  const notes = [trimmed && "Spaces trimmed", removedRows.length === 1 ? "Duplicate removed" : removedRows.length > 1 && `${removedRows.length} duplicates removed`].filter(Boolean) as string[];
  return { input, output: res.table, removedRows, notes };
}
