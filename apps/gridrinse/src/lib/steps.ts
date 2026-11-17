import { makeStep, type Step, type StepInput, type StepType } from "./engine/schema";

export interface StepMeta {
  label: string;
  /** One plain sentence: what the step does to your data. */
  explain: string;
}

export const STEP_META: Record<StepType, StepMeta> = {
  normalizeHeaders: { label: "Tidy column headers", explain: "Trims header names, names blank headers and gives duplicate names a _2 suffix. Optionally converts the style." },
  trim: { label: "Trim whitespace", explain: "Removes spaces at the start and end of cells, squeezes repeated spaces, and turns invisible characters (non-breaking and zero-width spaces) into normal ones." },
  removeBlankRows: { label: "Remove blank rows", explain: "Deletes rows where every cell is empty or only spaces." },
  dedupe: { label: "Remove duplicate rows", explain: "Deletes repeated rows. Compare whole rows, or only key columns such as Email." },
  formatDates: { label: "Standardize dates", explain: "Finds date columns and rewrites every date in one format. If a column could be day/month or month/day, it is flagged for you to decide instead of guessed." },
  formatNumbers: { label: "Clean numbers", explain: "Strips currency symbols and thousands separators, turns (45.00) into -45.00, and can fix the number of decimals." },
  findReplace: { label: "Find & replace", explain: "Replaces text, optionally only whole cells, only some columns, or with a regular expression." },
  renameColumns: { label: "Rename columns", explain: "Gives columns new names." },
  reorderColumns: { label: "Reorder columns", explain: "Moves the columns you list to the front, in that order." },
  dropColumns: { label: "Drop columns", explain: "Removes columns you do not need." },
  mergeColumns: { label: "Merge columns", explain: "Joins two or more columns into one, e.g. First + Last into Full name." },
  splitColumn: { label: "Split a column", explain: "Splits one column into several at a separator, e.g. \"Lee, Ann\" into Last and First." },
};

let counter = 0;
export function newStepId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function createStep(input: StepInput): Step {
  return { ...makeStep(input), id: input.id ?? newStepId() };
}

export function defaultSteps(numberColumns: string[]): Step[] {
  return [
    createStep({ type: "normalizeHeaders", style: "keep" }),
    createStep({ type: "trim" }),
    createStep({ type: "removeBlankRows" }),
    createStep({ type: "dedupe", keys: [] }),
    createStep({ type: "formatDates" }),
    createStep({ type: "formatNumbers", columns: numberColumns, enabled: numberColumns.length > 0 }),
  ];
}

/** Templates for the "Add a step" menu. */
export function templateFor(type: StepType, columns: string[]): Step {
  const first = columns[0] ?? "";
  switch (type) {
    case "findReplace":
      return createStep({ type, find: "N/A", replace: "", wholeCell: true });
    case "renameColumns":
      return createStep({ type, map: first ? { [first]: first } : {} });
    case "reorderColumns":
      return createStep({ type, order: [] });
    case "dropColumns":
      return createStep({ type, columns: [] });
    case "mergeColumns":
      return createStep({ type, columns: columns.slice(0, 2).length === 2 ? columns.slice(0, 2) : ["a", "b"], separator: " ", into: "" });
    case "splitColumn":
      return createStep({ type, column: first, separator: ",", into: ["part_1", "part_2"] });
    case "formatNumbers":
      return createStep({ type, columns: [] });
    default:
      return createStep({ type } as StepInput);
  }
}

/** Rewrite column references inside a step after columns were renamed upstream. */
export function renameRefs(step: Step, map: Record<string, string>): Step {
  const r = (c: string) => map[c] ?? c;
  const rl = (cs: string[]) => cs.map(r);
  switch (step.type) {
    case "trim":
      return { ...step, columns: rl(step.columns) };
    case "dedupe":
      return { ...step, keys: rl(step.keys) };
    case "formatDates": {
      const orderByColumn: Record<string, "DMY" | "MDY"> = {};
      for (const [k, v] of Object.entries(step.orderByColumn)) orderByColumn[r(k)] = v;
      return { ...step, columns: step.columns ? rl(step.columns) : null, orderByColumn };
    }
    case "formatNumbers":
    case "findReplace":
    case "dropColumns":
      return { ...step, columns: rl(step.columns) };
    case "renameColumns": {
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.map)) m[r(k)] = v;
      return { ...step, map: m };
    }
    case "reorderColumns":
      return { ...step, order: rl(step.order) };
    case "mergeColumns":
      return { ...step, columns: rl(step.columns) };
    case "splitColumn":
      return { ...step, column: r(step.column) };
    default:
      return step;
  }
}

export function describeStepShort(step: Step): string {
  switch (step.type) {
    case "dedupe":
      return step.keys.length ? `by ${step.keys.join(", ")}` : "whole rows";
    case "formatDates":
      return `to ${step.outputFormat}`;
    case "formatNumbers":
      return step.columns.length ? step.columns.join(", ") : "no columns chosen";
    case "findReplace":
      return `"${step.find}" → "${step.replace}"`;
    case "normalizeHeaders":
      return { keep: "trim only", snake: "snake_case", title: "Title Case", lower: "lower case" }[step.style];
    default:
      return "";
  }
}
