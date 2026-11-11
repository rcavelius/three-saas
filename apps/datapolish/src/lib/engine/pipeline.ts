import { removeBlankRows, removeDuplicates, normalizeHeaders, trimWhitespace } from "./ops/basic";
import { dropColumns, mergeColumns, renameColumns, reorderColumns, splitColumn } from "./ops/columns";
import { formatDates } from "./ops/dates";
import { findReplace } from "./ops/findReplace";
import { formatNumbers } from "./ops/numbers";
import type { Step } from "./schema";
import type { ChangeReport, OpResult, Table } from "./types";

export function applyStep(table: Table, step: Step): OpResult {
  switch (step.type) {
    case "trim":
      return trimWhitespace(table, step);
    case "removeBlankRows":
      return removeBlankRows(table);
    case "dedupe":
      return removeDuplicates(table, step);
    case "normalizeHeaders":
      return normalizeHeaders(table, step);
    case "formatDates":
      return formatDates(table, step);
    case "formatNumbers":
      return formatNumbers(table, step);
    case "findReplace":
      return findReplace(table, step);
    case "renameColumns":
      return renameColumns(table, step.map);
    case "reorderColumns":
      return reorderColumns(table, step.order);
    case "dropColumns":
      return dropColumns(table, step.columns);
    case "mergeColumns":
      return mergeColumns(table, step);
    case "splitColumn":
      return splitColumn(table, step);
  }
}

export interface StepRun {
  step: Step;
  report: ChangeReport;
  /** Set when the step failed; the table passed through unchanged. */
  error?: string;
  skipped?: boolean;
  durationMs: number;
  /** Column names after this step ran (what the next step sees). */
  columnsAfter: string[];
}

export interface RemovedRow {
  /** 0-based index in the original (input) table. */
  originalIndex: number;
  values: string[];
  stepIndex: number;
  stepType: Step["type"];
}

export interface PipelineResult {
  table: Table;
  steps: StepRun[];
  /** For each output row, its 0-based index in the input table. */
  rowOrigins: number[];
  /** For each output column, the input column index it came from, or null if it was created by a step. */
  columnOrigins: (number | null)[];
  /** Flags (rows x columns, row-major) for output cells changed by any step. */
  changedFlags: Uint8Array;
  changedCount: number;
  removed: RemovedRow[];
}

export function isCellChanged(result: Pick<PipelineResult, "changedFlags" | "table">, row: number, col: number): boolean {
  return result.changedFlags[row * result.table.columns.length + col] === 1;
}

/**
 * Run steps in order. A step that throws is reported with its error and skipped; the others still run.
 * Tracks where every output row and column came from so the UI can show before/after and removed rows.
 */
export function runPipeline(input: Table, steps: readonly Step[], onStep?: (index: number, total: number) => void): PipelineResult {
  const originalRows = input.rows.length;
  let table = input;
  let rowOrigins = input.rows.map((_, i) => i);
  // Stable column ids: original columns use their index; created columns get fresh ids.
  let colIds = input.columns.map((_, i) => i);
  let nextColId = input.columns.length;
  const flags = new Map<number, Uint8Array>();
  const flagFor = (id: number) => {
    let f = flags.get(id);
    if (!f) {
      f = new Uint8Array(originalRows);
      flags.set(id, f);
    }
    return f;
  };
  const runs: StepRun[] = [];
  const removed: RemovedRow[] = [];

  steps.forEach((step, si) => {
    onStep?.(si, steps.length);
    if (!step.enabled) {
      runs.push({ step, report: { rowsRemoved: 0, cellsChanged: 0, changedCells: [], warnings: [] }, skipped: true, durationMs: 0, columnsAfter: table.columns });
      return;
    }
    const t0 = Date.now();
    let res: OpResult;
    try {
      res = applyStep(table, step);
    } catch (e) {
      runs.push({
        step,
        report: { rowsRemoved: 0, cellsChanged: 0, changedCells: [], warnings: [] },
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - t0,
        columnsAfter: table.columns,
      });
      return;
    }
    // Columns first (changed cells are reported in output coordinates).
    if (res.columnSources) {
      colIds = res.columnSources.map((s) => (s === null ? nextColId++ : colIds[s]!));
    }
    if (res.removedRows.length > 0) {
      const gone = new Set(res.removedRows);
      for (const r of res.removedRows) {
        const originalIndex = rowOrigins[r]!;
        removed.push({ originalIndex, values: input.rows[originalIndex] ?? [], stepIndex: si, stepType: step.type });
      }
      rowOrigins = rowOrigins.filter((_, i) => !gone.has(i));
    }
    for (const [r, c] of res.changed) {
      const origin = rowOrigins[r];
      const id = colIds[c];
      if (origin !== undefined && id !== undefined) flagFor(id)[origin] = 1;
    }
    table = res.table;
    runs.push({ step, report: res.report, durationMs: Date.now() - t0, columnsAfter: table.columns });
  });

  const width = table.columns.length;
  const changedFlags = new Uint8Array(table.rows.length * width);
  let changedCount = 0;
  colIds.forEach((id, c) => {
    const f = flags.get(id);
    if (!f) return;
    rowOrigins.forEach((origin, r) => {
      if (f[origin]) {
        changedFlags[r * width + c] = 1;
        changedCount++;
      }
    });
  });
  const columnOrigins = colIds.map((id) => (id < input.columns.length ? id : null));
  removed.sort((a, b) => a.originalIndex - b.originalIndex);
  return { table, steps: runs, rowOrigins, columnOrigins, changedFlags, changedCount, removed };
}
