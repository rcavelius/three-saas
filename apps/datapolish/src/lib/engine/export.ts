import * as XLSX from "xlsx";
import type { Table } from "./types";

export interface CsvExportOptions {
  delimiter?: string;
  /** Prepend a UTF-8 byte order mark so Excel opens accents and symbols correctly. */
  bom?: boolean;
  lineEnding?: "crlf" | "lf";
  /** Prefix cells that start with = + - @ with an apostrophe so spreadsheet apps do not run them as formulas. */
  guardFormulas?: boolean;
}

function quote(value: string, delimiter: string): string {
  if (value === "") return "";
  const needs = value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r") || /^\s|\s$/.test(value);
  return needs ? `"${value.replace(/"/g, '""')}"` : value;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function toCsv(table: Table, opts: CsvExportOptions = {}): string {
  const delimiter = opts.delimiter ?? ",";
  const eol = opts.lineEnding === "lf" ? "\n" : "\r\n";
  const cell = (v: string) => {
    const guarded = opts.guardFormulas && FORMULA_START.test(v) && !/^[+-]?\d/.test(v) ? `'${v}` : v;
    return quote(guarded, delimiter);
  };
  const lines = [table.columns, ...table.rows].map((r) => r.map(cell).join(delimiter));
  const body = lines.join(eol) + (lines.length > 0 ? eol : "");
  return (opts.bom ? "﻿" : "") + body;
}

/** Plain numbers that are safe to store as numbers (no leading zeros, at most 15 significant digits). */
const SAFE_NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,15})?$/;

function toSheet(table: Table, typeNumbers: boolean): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [table.columns, ...table.rows.map((r) => r.map((v) => (typeNumbers && SAFE_NUMBER.test(v) && v.replace(/[-.]/g, "").length <= 15 ? Number(v) : v)))];
  return XLSX.utils.aoa_to_sheet(aoa);
}

export function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/\.[^.]+$/, "").replace(/[\][:*?/\\]/g, "_").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  base = candidate;
  return base;
}

export interface XlsxExportOptions {
  /** Store plain numeric text as real numbers (leading-zero values like 00123 always stay text). */
  typeNumbers?: boolean;
}

/** Write one or more tables as sheets of a single .xlsx file. */
export function toXlsx(sheets: { name: string; table: Table }[], opts: XlsxExportOptions = {}): Uint8Array {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, toSheet(s.table, opts.typeNumbers ?? true), safeSheetName(s.name, used));
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
  return new Uint8Array(out);
}
