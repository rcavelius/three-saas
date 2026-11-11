import { dedupeNames, finishResult, mapCells, resolveColumns, type OpResult, type Table } from "../types";

/** Zero-width and BOM characters that are invisible but make values differ. */
const INVISIBLE = /[​‌‍⁠﻿­]/g;
/** Non-breaking and other unusual space characters that should behave like a normal space. */
const ODD_SPACES = /[   -   　]/g;

export interface TrimOptions {
  collapseInternal: boolean;
  removeInvisible: boolean;
  columns?: string[];
}

export function cleanSpaces(value: string, opts: Pick<TrimOptions, "collapseInternal" | "removeInvisible">): string {
  let v = value;
  if (opts.removeInvisible) v = v.replace(INVISIBLE, "").replace(ODD_SPACES, " ");
  if (opts.collapseInternal) v = v.replace(/[ \t]{2,}/g, " ");
  return v.trim();
}

export function trimWhitespace(table: Table, opts: TrimOptions): OpResult {
  const warnings: string[] = [];
  const cols = resolveColumns(table, opts.columns, warnings);
  const { table: out, changed } = mapCells(table, cols, (v) => cleanSpaces(v, opts));
  return finishResult(out, { changed, warnings });
}

function isBlankCell(v: string): boolean {
  return cleanSpaces(v, { collapseInternal: false, removeInvisible: true }) === "";
}

export function removeBlankRows(table: Table): OpResult {
  const removedRows: number[] = [];
  const rows = table.rows.filter((row, i) => {
    const blank = row.every(isBlankCell);
    if (blank) removedRows.push(i);
    return !blank;
  });
  return finishResult({ columns: table.columns.slice(), rows }, { removedRows });
}

export interface DedupeOptions {
  /** Key columns; empty = compare whole rows. */
  keys: string[];
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
  keep: "first" | "last";
}

export function removeDuplicates(table: Table, opts: DedupeOptions): OpResult {
  const warnings: string[] = [];
  const cols = resolveColumns(table, opts.keys, warnings);
  if (opts.keys.length > 0 && cols.length === 0) {
    warnings.push("None of the key columns exist, so no duplicates were removed.");
    return finishResult({ columns: table.columns.slice(), rows: table.rows.slice() }, { warnings });
  }
  const norm = (v: string) => {
    let s = v;
    if (opts.ignoreWhitespace) s = cleanSpaces(s, { collapseInternal: true, removeInvisible: true });
    if (opts.ignoreCase) s = s.toLocaleLowerCase();
    return s;
  };
  const keyOf = (row: string[]) => JSON.stringify(cols.map((c) => norm(row[c] ?? "")));
  const keepIndex = new Map<string, number>();
  const n = table.rows.length;
  const order = opts.keep === "first" ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
  const duplicateOf: Record<number, number> = {};
  for (const i of order) {
    const key = keyOf(table.rows[i]!);
    const kept = keepIndex.get(key);
    if (kept === undefined) keepIndex.set(key, i);
    else duplicateOf[i] = kept;
  }
  const removedRows = Object.keys(duplicateOf)
    .map(Number)
    .sort((a, b) => a - b);
  const removedSet = new Set(removedRows);
  const rows = table.rows.filter((_, i) => !removedSet.has(i));
  // duplicateOf maps removed input row -> kept input row (both 0-based, input coordinates).
  return finishResult({ columns: table.columns.slice(), rows }, { removedRows, warnings, details: { duplicateOf } });
}

export type HeaderStyle = "keep" | "snake" | "title" | "lower";

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function styleHeader(name: string, style: HeaderStyle): string {
  const trimmed = cleanSpaces(name, { collapseInternal: true, removeInvisible: true });
  switch (style) {
    case "keep":
      return trimmed;
    case "lower":
      return trimmed.toLocaleLowerCase();
    case "snake":
      return words(trimmed)
        .map((w) => w.toLocaleLowerCase())
        .join("_");
    case "title":
      return words(trimmed)
        .map((w) => (w === w.toUpperCase() && w.length > 1 && w.length <= 3 ? w : w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()))
        .join(" ");
  }
}

export interface HeaderOptions {
  style: HeaderStyle;
}

export function normalizeHeaders(table: Table, opts: HeaderOptions): OpResult {
  const styled = table.columns.map((c, i) => {
    const s = styleHeader(c, opts.style);
    if (s !== "") return s;
    return opts.style === "title" ? `Column ${i + 1}` : `column_${i + 1}`;
  });
  const columns = dedupeNames(styled);
  const renamed = table.columns.map((from, i) => ({ from, to: columns[i]! })).filter((r) => r.from !== r.to);
  return finishResult({ columns, rows: table.rows.slice() }, { details: { renamed } });
}
