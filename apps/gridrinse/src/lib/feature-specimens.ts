import { runPipeline } from "@/lib/engine/pipeline";
import { makeStep } from "@/lib/engine/schema";

/**
 * The small before/after demos on the Features page. Every "after" value comes from the real engine at render
 * time, so the page can only show what the cleaner actually does.
 */
type Table = { columns: string[]; rows: string[][] };

function run(input: Table, steps: Parameters<typeof runPipeline>[1]) {
  const res = runPipeline(input, steps);
  const removedRows = input.rows.map((_, i) => i).filter((i) => !res.rowOrigins.includes(i));
  return { input, output: res.table, removedRows };
}

function cell(input: string, steps: Parameters<typeof runPipeline>[1]) {
  return { before: input, after: runPipeline({ columns: ["v"], rows: [[input]] }, steps).table.rows[0]![0]! };
}

export function featureSpecimens() {
  return {
    trim: cell("Maria  Lopez ", [makeStep({ type: "trim" })]),
    dedupe: run(
      {
        columns: ["Customer", "Date", "Amount"],
        rows: [
          ["Maria Lopez", "2024-01-17", "1234.50"],
          ["Maria Lopez", "2024-01-17", "1234.50"],
        ],
      },
      [makeStep({ type: "dedupe" })],
    ),
    blank: run(
      {
        columns: ["Customer", "Amount"],
        rows: [
          ["Maria Lopez", "1234.50"],
          ["", ""],
          ["Ethan Clark", "-45.00"],
          ["", ""],
        ],
      },
      [makeStep({ type: "removeBlankRows" })],
    ),
    date: cell("Jan 17, 2024", [makeStep({ type: "formatDates" })]),
    number: cell("$1,234.50", [makeStep({ type: "formatNumbers", columns: ["v"], decimals: 2 })]),
    review: run({ columns: ["Customer", "Amount"], rows: [["Maria  Lopez", "$1,234.50"]] }, [
      makeStep({ type: "trim" }),
      makeStep({ type: "formatNumbers", columns: ["Amount"], decimals: 2 }),
    ]),
  };
}
