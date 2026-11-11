import { dedupeNames, finishResult, resolveColumns, type CellRef, type OpResult, type Table } from "../types";

/** Rename columns: { oldName: newName }. Clashing names get a _2 suffix. */
export function renameColumns(table: Table, map: Record<string, string>): OpResult {
  const warnings: string[] = [];
  for (const from of Object.keys(map)) {
    if (!table.columns.includes(from)) warnings.push(`Column "${from}" was not found, so it was not renamed.`);
  }
  const wanted = table.columns.map((c) => {
    const to = map[c];
    return to !== undefined && to.trim() !== "" ? to.trim() : c;
  });
  const columns = dedupeNames(wanted);
  columns.forEach((c, i) => {
    if (c !== wanted[i]) warnings.push(`"${wanted[i]}" already existed, so the column was named "${c}".`);
  });
  return finishResult({ columns, rows: table.rows.slice() }, { warnings });
}

function project(table: Table, sources: number[]): Table {
  return {
    columns: sources.map((s) => table.columns[s]!),
    rows: table.rows.map((r) => sources.map((s) => r[s] ?? "")),
  };
}

/** Put the listed columns first, in that order; the rest follow in their current order. */
export function reorderColumns(table: Table, order: string[]): OpResult {
  const warnings: string[] = [];
  const first = resolveColumns(table, order, warnings);
  const rest = table.columns.map((_, i) => i).filter((i) => !first.includes(i));
  const sources = [...first, ...rest];
  return finishResult(project(table, sources), { columnSources: sources, warnings });
}

export function dropColumns(table: Table, columns: string[]): OpResult {
  const warnings: string[] = [];
  const drop = columns.length === 0 ? [] : resolveColumns(table, columns, warnings);
  const sources = table.columns.map((_, i) => i).filter((i) => !drop.includes(i));
  return finishResult(project(table, sources), { columnSources: sources, warnings, details: { dropped: drop.map((i) => table.columns[i]!) } });
}

export interface MergeColumnsOptions {
  columns: string[];
  separator: string;
  into: string;
  keepOriginals: boolean;
  /** Skip empty parts so you do not get "Smith, " or double separators. */
  skipEmpty: boolean;
}

/** Combine two or more columns into one new column, placed where the first source column was. */
export function mergeColumns(table: Table, opts: MergeColumnsOptions): OpResult {
  const warnings: string[] = [];
  const src = resolveColumns(table, opts.columns, warnings);
  if (opts.columns.length < 2 || src.length < 2) throw new Error("Choose at least two existing columns to merge.");
  const into = opts.into.trim() || src.map((i) => table.columns[i]).join("_");
  const insertAt = Math.min(...src);
  const kept = table.columns.map((_, i) => i).filter((i) => opts.keepOriginals || !src.includes(i));
  const posInKept = kept.filter((i) => i < insertAt).length + (opts.keepOriginals ? 1 : 0);
  const sources: (number | null)[] = [...kept];
  sources.splice(posInKept, 0, null);
  const names = sources.map((s) => (s === null ? into : table.columns[s]!));
  const columns = dedupeNames(names);
  const changed: CellRef[] = [];
  const rows = table.rows.map((r, ri) => {
    const parts = src.map((i) => r[i] ?? "");
    const value = (opts.skipEmpty ? parts.filter((p) => p.trim() !== "") : parts).join(opts.separator);
    changed.push([ri, posInKept]);
    return sources.map((s) => (s === null ? value : r[s] ?? ""));
  });
  return finishResult({ columns, rows }, { columnSources: sources, changed, warnings });
}

export interface SplitColumnOptions {
  column: string;
  separator: string;
  /** Names for the new columns. Extra pieces are kept together in the last new column. */
  into: string[];
  keepOriginal: boolean;
}

export function splitColumn(table: Table, opts: SplitColumnOptions): OpResult {
  const idx = table.columns.indexOf(opts.column);
  if (idx === -1) throw new Error(`Column "${opts.column}" was not found.`);
  if (opts.separator === "") throw new Error("Enter a separator to split on.");
  const into = opts.into.map((n) => n.trim()).filter(Boolean);
  if (into.length < 2) throw new Error("Give at least two names for the new columns.");
  const warnings: string[] = [];
  const kept = table.columns.map((_, i) => i).filter((i) => opts.keepOriginal || i !== idx);
  const insertPos = kept.filter((i) => i < idx).length + (opts.keepOriginal ? 1 : 0);
  const sources: (number | null)[] = [...kept];
  sources.splice(insertPos, 0, ...into.map(() => null));
  let newIdx = 0;
  const columns = dedupeNames(sources.map((s) => (s === null ? into[newIdx++]! : table.columns[s]!)));
  let overflow = 0;
  const changed: CellRef[] = [];
  const rows = table.rows.map((r, ri) => {
    const pieces = (r[idx] ?? "").split(opts.separator);
    if (pieces.length > into.length) {
      overflow++;
      const head = pieces.slice(0, into.length - 1);
      head.push(pieces.slice(into.length - 1).join(opts.separator));
      pieces.length = 0;
      pieces.push(...head);
    }
    let k = 0;
    const out = sources.map((s) => {
      if (s !== null) return r[s] ?? "";
      return (pieces[k++] ?? "").trim();
    });
    into.forEach((_, j) => {
      if ((out[insertPos + j] ?? "") !== "") changed.push([ri, insertPos + j]);
    });
    return out;
  });
  if (overflow > 0) warnings.push(`${overflow} value(s) had more pieces than new columns; the extra pieces were kept in "${into[into.length - 1]}".`);
  return finishResult({ columns, rows }, { columnSources: sources, changed, warnings });
}
