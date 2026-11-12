/**
 * Core table model. Cells are always raw strings; every row has exactly `columns.length` cells.
 * Tables are treated as immutable: operations return a new table and never write into the input.
 * Unchanged row arrays may be shared between input and output, so nothing may mutate them.
 */
export interface Table {
  columns: string[];
  rows: string[][];
}

/** [rowIndex, columnIndex] in the coordinates of the table a step produced. */
export type CellRef = [row: number, col: number];

export interface ChangeReport {
  rowsRemoved: number;
  cellsChanged: number;
  /** A capped sample of changed cells (output coordinates). */
  changedCells: CellRef[];
  warnings: string[];
  /** Row indices (input coordinates) that this step removed. */
  removedRowIndices?: number[];
  /** Step-specific extra information (e.g. columns needing a date order choice). */
  details?: Record<string, unknown>;
}

/** Full result of a single operation, used by the pipeline runner for provenance tracking. */
export interface OpResult {
  table: Table;
  report: ChangeReport;
  /** Every changed cell (output coordinates), not capped. */
  changed: CellRef[];
  /** Input row indices removed, ascending. */
  removedRows: number[];
  /**
   * For each output column, the input column index it derives from, or null for a new column.
   * null (the whole field) means columns are unchanged (identity).
   */
  columnSources: (number | null)[] | null;
}

export const CHANGED_SAMPLE_CAP = 200;

export function finishResult(
  table: Table,
  parts: {
    changed?: CellRef[];
    removedRows?: number[];
    columnSources?: (number | null)[] | null;
    warnings?: string[];
    details?: Record<string, unknown>;
  } = {},
): OpResult {
  const changed = parts.changed ?? [];
  const removedRows = parts.removedRows ?? [];
  const report: ChangeReport = {
    rowsRemoved: removedRows.length,
    cellsChanged: changed.length,
    changedCells: changed.slice(0, CHANGED_SAMPLE_CAP),
    warnings: parts.warnings ?? [],
  };
  if (removedRows.length > 0) report.removedRowIndices = removedRows;
  if (parts.details) report.details = parts.details;
  return { table, report, changed, removedRows, columnSources: parts.columnSources ?? null };
}

/** Resolve column names to indices. Missing names add a warning. Empty/undefined list = all columns. */
export function resolveColumns(table: Table, names: readonly string[] | undefined | null, warnings: string[]): number[] {
  if (!names || names.length === 0) return table.columns.map((_, i) => i);
  const out: number[] = [];
  for (const name of names) {
    const idx = table.columns.indexOf(name);
    if (idx === -1) warnings.push(`Column "${name}" was not found, so it was skipped.`);
    else if (!out.includes(idx)) out.push(idx);
  }
  return out;
}

/**
 * Apply `fn` to every cell in the chosen columns. Rows that do not change keep their array reference
 * (safe because tables are immutable); changed rows are copied.
 */
export function mapCells(
  table: Table,
  colIndices: readonly number[],
  fn: (value: string, row: number, col: number) => string,
): { table: Table; changed: CellRef[] } {
  const changed: CellRef[] = [];
  const rows = table.rows.map((row, r) => {
    let copy: string[] | null = null;
    for (const c of colIndices) {
      const before = row[c] ?? "";
      const after = fn(before, r, c);
      if (after !== before) {
        if (!copy) copy = row.slice();
        copy[c] = after;
        changed.push([r, c]);
      }
    }
    return copy ?? row;
  });
  return { table: { columns: table.columns.slice(), rows }, changed };
}

/** Make names unique by appending _2, _3 ... to later duplicates (case-insensitive comparison). */
export function dedupeNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    let n = 2;
    while (seen.has(candidate.toLowerCase())) {
      candidate = `${name}_${n}`;
      n++;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

/** Pad or keep every row at the column width. */
export function padRows(rows: string[][], width: number): string[][] {
  return rows.map((r) => (r.length === width ? r : r.length < width ? [...r, ...Array<string>(width - r.length).fill("")] : r.slice(0, width)));
}
