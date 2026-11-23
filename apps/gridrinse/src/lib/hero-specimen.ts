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
  // Input cells the engine rewrote (by the row each output row came from): the hero marks them as "messy".
  const changedCells = res.rowOrigins.flatMap((origin, i) =>
    input.rows[origin]!.flatMap((cell, c) => (cell !== res.table.rows[i]![c] ? [[origin, c] as [number, number]] : [])),
  );
  return { input, output: res.table, removedRows, notes, changedCells };
}

/**
 * The homepage explainer: a messy export with every common problem (stray spaces, a duplicate, mixed date formats,
 * "N/A", currency junk) and what the real engine returns for it. `issues` marks the input cells the engine rewrote
 * and the rows it removed; nothing in the "after" table is hand-written.
 */
export function explainerSpecimen() {
  const input = {
    columns: ["Customer", "Date", "Amount"],
    rows: [
      ["  Maria Lopez", "Jan 17, 2024", "$1,234.50"],
      ["Ethan Clark", "1/15/2024", "(45.00)"],
      ["Maria Lopez ", "Jan 17, 2024", "$1,234.50"],
      ["Aiko Tanaka", "2024/01/18", "N/A"],
      ["Noah Smith ", "22 Jan 2024", "USD 58"],
    ],
  };
  const res = runPipeline(input, [
    makeStep({ type: "trim" }),
    makeStep({ type: "findReplace", find: "N/A", replace: "", wholeCell: true }),
    makeStep({ type: "dedupe" }),
    makeStep({ type: "formatDates" }),
    makeStep({ type: "formatNumbers", columns: ["Amount"], decimals: 2 }),
  ]);
  const removedRows = input.rows.map((_, i) => i).filter((i) => !res.rowOrigins.includes(i));
  const changed = res.rowOrigins.flatMap((origin, i) =>
    input.rows[origin]!.flatMap((cell, c) => (cell !== res.table.rows[i]![c] ? [`${origin}:${c}`] : [])),
  );
  return { input, output: res.table, rowOrigins: res.rowOrigins, removedRows, changed };
}
