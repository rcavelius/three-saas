import Papa from "papaparse";
import * as XLSX from "xlsx";
import { dedupeNames, type Table } from "./types";

export interface ParseResult {
  table: Table;
  warnings: string[];
  /** Detected or used delimiter for CSV. */
  delimiter?: string;
  /** Sheet names for workbooks. */
  sheets?: string[];
  sheet?: string;
  /** 1-based data row numbers that were shorter/longer than the header. */
  raggedRows?: number[];
}

export interface CsvOptions {
  /** Force a delimiter; omit to auto-detect (comma, semicolon, tab, pipe). */
  delimiter?: string;
  hasHeader?: boolean;
}

/** Decode file bytes: strict UTF-8 first (BOM stripped), falling back to Windows-1252 for legacy Excel exports. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text: stripBom(text), encoding: "utf-8" };
  } catch {
    const text = new TextDecoder("windows-1252").decode(bytes);
    return { text: stripBom(text), encoding: "windows-1252" };
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function headerNames(raw: string[]): string[] {
  return dedupeNames(raw.map((h, i) => (h.trim() === "" ? `column_${i + 1}` : h)));
}

/** Turn a ragged array of arrays into a rectangular table. Longer rows add `extra_N` columns, never drop data. */
export function rowsToTable(data: string[][], hasHeader: boolean): ParseResult {
  const warnings: string[] = [];
  if (data.length === 0 || (data.length === 1 && data[0]!.every((c) => c === "") && data[0]!.length <= 1)) {
    return { table: { columns: [], rows: [] }, warnings: ["The file is empty."] };
  }
  const header = hasHeader ? data[0]! : [];
  const body = hasHeader ? data.slice(1) : data;
  // A loop, not Math.max(...spread): spreading hundreds of thousands of rows overflows the call stack.
  let width = header.length;
  for (const r of body) if (r.length > width) width = r.length;
  const rawColumns = hasHeader ? [...header] : [];
  let extra = 1;
  while (rawColumns.length < width) {
    rawColumns.push(hasHeader ? `extra_${extra++}` : `column_${rawColumns.length + 1}`);
  }
  const columns = headerNames(rawColumns);
  const ragged: number[] = [];
  const rows = body.map((r, i) => {
    const blankLine = r.length === 1 && r[0] === "";
    if (hasHeader && !blankLine && r.length !== header.length) ragged.push(i + 1);
    return r.length === width ? r : [...r, ...Array<string>(width - r.length).fill("")];
  });
  if (hasHeader && width > header.length) {
    warnings.push(`Some rows have more cells than the header; ${width - header.length} extra column(s) were added so no data is lost.`);
  }
  if (ragged.length > 0) {
    const shown = ragged.slice(0, 5).join(", ");
    warnings.push(
      `${ragged.length} row(s) had a different number of cells than the header (data row ${shown}${ragged.length > 5 ? ", ..." : ""}). Short rows were padded with empty cells.`,
    );
  }
  return { table: { columns, rows }, warnings, raggedRows: ragged };
}

export function parseCsv(input: string, options: CsvOptions = {}): ParseResult {
  const text = stripBom(input);
  if (text.trim() === "") return { table: { columns: [], rows: [] }, warnings: ["The file is empty."] };
  const result = Papa.parse<string[]>(text, {
    delimiter: options.delimiter ?? "",
    delimitersToGuess: [",", ";", "\t", "|"],
    skipEmptyLines: false,
    header: false,
    dynamicTyping: false,
  });
  const data = result.data.map((r) => r.map((c) => (c == null ? "" : String(c))));
  // A trailing newline yields one final [""] row; drop it (it is not a real blank row).
  if (data.length > 0) {
    const last = data[data.length - 1]!;
    if (last.length === 1 && last[0] === "") data.pop();
  }
  const out = rowsToTable(data, options.hasHeader ?? true);
  // Blank lines inside the file come back as a single empty field; they are padded to blank rows.
  const parseErrors = result.errors.filter((e) => e.code !== "UndetectableDelimiter" && e.code !== "TooFewFields" && e.code !== "TooManyFields");
  for (const e of parseErrors.slice(0, 3)) out.warnings.push(`CSV parser: ${e.message}${e.row != null ? ` (row ${e.row + 1})` : ""}.`);
  out.delimiter = result.meta.delimiter;
  return out;
}

export type XlsxDateMode = "display" | "iso";

export interface XlsxOptions {
  /** Sheet to read; defaults to the first sheet. */
  sheet?: string;
  /** "display": dates exactly as Excel shows them. "iso": real date cells become YYYY-MM-DD (with time if present). */
  dateMode?: XlsxDateMode;
  hasHeader?: boolean;
}

export function listSheets(data: ArrayBuffer | Uint8Array): string[] {
  const wb = XLSX.read(data, { type: "array", bookSheets: true });
  return wb.SheetNames.slice();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromSerial(serial: number, date1904: boolean): string {
  const p = XLSX.SSF.parse_date_code(serial, { date1904 });
  if (!p) return String(serial);
  const date = `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  const hasTime = p.H !== 0 || p.M !== 0 || Math.round(p.S) !== 0;
  return hasTime ? `${date} ${pad2(p.H)}:${pad2(p.M)}:${pad2(Math.round(p.S))}` : date;
}

/**
 * Parse an XLSX/XLS/ODS workbook. Formulas are read as their cached values (what Excel last calculated);
 * nothing is recalculated.
 */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, options: XlsxOptions = {}): ParseResult {
  const wb = XLSX.read(data, { type: "array", cellNF: true, cellDates: false, dense: false });
  const sheets = wb.SheetNames.slice();
  if (sheets.length === 0) return { table: { columns: [], rows: [] }, warnings: ["The workbook has no sheets."], sheets };
  const sheetName = options.sheet && sheets.includes(options.sheet) ? options.sheet : sheets[0]!;
  const warnings: string[] = [];
  if (options.sheet && options.sheet !== sheetName) warnings.push(`Sheet "${options.sheet}" was not found; read "${sheetName}" instead.`);
  const ws = wb.Sheets[sheetName];
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  if (!ws || !ws["!ref"]) {
    return { table: { columns: [], rows: [] }, warnings: [...warnings, "The sheet is empty."], sheets, sheet: sheetName };
  }
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const dateMode = options.dateMode ?? "display";
  const data2: string[][] = [];
  let formulaCount = 0;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell || cell.t === "z") {
        row.push("");
        continue;
      }
      if (cell.f) formulaCount++;
      if (cell.t === "e") {
        row.push(cell.w ?? "#ERROR");
        continue;
      }
      const isDate = cell.t === "d" || (cell.t === "n" && typeof cell.z === "string" && XLSX.SSF.is_date(cell.z));
      if (isDate && dateMode === "iso") {
        if (cell.v instanceof Date) row.push(cell.v.toISOString().slice(0, 10));
        else row.push(isoFromSerial(Number(cell.v), date1904));
        continue;
      }
      if (cell.w != null) row.push(cell.w);
      else if (cell.v == null) row.push("");
      else row.push(XLSX.utils.format_cell(cell));
    }
    data2.push(row);
  }
  // Drop trailing fully-empty rows that only exist because of formatting in the used range.
  while (data2.length > 0 && data2[data2.length - 1]!.every((c) => c === "")) data2.pop();
  const out = rowsToTable(data2, options.hasHeader ?? true);
  if (formulaCount > 0) out.warnings.push(`${formulaCount} formula cell(s) were read as their last calculated values.`);
  return { ...out, warnings: [...warnings, ...out.warnings], sheets, sheet: sheetName };
}

export type FileKind = "csv" | "workbook" | "unsupported";

export function detectKind(fileName: string): FileKind {
  const lower = fileName.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(lower)) return "csv";
  if (/\.(xlsx|xlsm|xls|ods)$/.test(lower)) return "workbook";
  return "unsupported";
}

export interface ParseFileOptions extends CsvOptions {
  sheet?: string;
  dateMode?: XlsxDateMode;
}

/** Parse raw file bytes by extension. Throws on unsupported types. */
export function parseFileBytes(name: string, bytes: Uint8Array, options: ParseFileOptions = {}): ParseResult & { encoding?: string } {
  const kind = detectKind(name);
  if (kind === "csv") {
    const { text, encoding } = decodeText(bytes);
    const res = parseCsv(text, { delimiter: options.delimiter ?? (name.toLowerCase().endsWith(".tsv") ? "\t" : undefined), hasHeader: options.hasHeader });
    if (encoding !== "utf-8") res.warnings.push("The file was not valid UTF-8, so it was read as Windows-1252 (common for older Excel exports).");
    return { ...res, encoding };
  }
  if (kind === "workbook") return parseWorkbook(bytes, { sheet: options.sheet, dateMode: options.dateMode, hasHeader: options.hasHeader });
  throw new Error("Unsupported file type. Use .csv, .tsv, .txt, .xlsx, .xls or .ods.");
}
