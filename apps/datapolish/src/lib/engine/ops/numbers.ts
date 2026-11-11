import { finishResult, mapCells, resolveColumns, type OpResult, type Table } from "../types";

/**
 * Numbers are handled as decimal strings end to end (no floating point), so "0.1 + rounding" style
 * errors cannot creep in and 19-digit IDs are not corrupted.
 */
export interface ParsedNumber {
  negative: boolean;
  int: string; // digits only, no leading zeros except "0"
  frac: string; // digits only
  percent: boolean;
  /** True if the source had currency, grouping, parentheses, % or spaces. */
  formatted: boolean;
}

const CURRENCY_SYMBOLS = /[$€£¥₹₩₽¢₺₪₫฿₦₱]/g;
const CURRENCY_CODES = /^(?:USD|EUR|GBP|JPY|CAD|AUD|NZD|CHF|SEK|NOK|DKK|INR|CNY|HKD|SGD|ZAR|BRL|MXN|PLN)\s*|\s*(?:USD|EUR|GBP|JPY|CAD|AUD|NZD|CHF|SEK|NOK|DKK|INR|CNY|HKD|SGD|ZAR|BRL|MXN|PLN)$/;

export function parseNumberCell(raw: string, decimalComma = false): ParsedNumber | null {
  let s = raw.trim();
  if (s === "") return null;
  const formatted = /[^\d.+-]/.test(s);
  let negative = false;
  let percent = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/−/g, "-");
  // Currency may sit on either side of the sign: -$5, $-5, USD 5
  s = s.replace(CURRENCY_CODES, "").replace(CURRENCY_SYMBOLS, "").trim();
  let sign = "";
  if (s.startsWith("-") || s.startsWith("+")) {
    sign = s[0]!;
    s = s.slice(1).trim();
  } else if (s.endsWith("-")) {
    sign = "-"; // trailing minus, as some accounting exports write it: 120.00-
    s = s.slice(0, -1).trim();
  }
  if (sign === "-") {
    if (negative) return null; // "(-5)" is not a sensible value
    negative = true;
  }
  if (/[+-]/.test(s)) return null;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  // Spaces (incl. non-breaking / thin) are allowed as thousands separators.
  s = s.replace(/[\s  ]/g, (m, offset: number, str: string) => (/\d/.test(str[offset - 1] ?? "") && /\d/.test(str[offset + 1] ?? "") ? "\u0000" : m));
  if (/\s/.test(s)) return null;
  const group = decimalComma ? "[.'\u0000]" : "[,'\u0000]";
  const dec = decimalComma ? "," : "\\.";
  const re = new RegExp(`^(\\d{1,3}(?:${group}\\d{3})+|\\d+)?(?:${dec}(\\d+))?$`);
  const m = s.match(re);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const int = (m[1] ?? "0").replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  const frac = m[2] ?? "";
  return { negative, int, frac, percent, formatted };
}

/** Round a decimal string half away from zero. */
export function roundDigits(int: string, frac: string, decimals: number): { int: string; frac: string } {
  if (frac.length <= decimals) return { int, frac: frac.padEnd(decimals, "0") };
  const keep = int + frac.slice(0, decimals);
  const next = Number(frac[decimals]);
  if (next < 5) return { int, frac: frac.slice(0, decimals) };
  // increment the digit string
  const digits = keep.split("").map(Number);
  let i = digits.length - 1;
  while (i >= 0) {
    if (digits[i]! < 9) {
      digits[i]!++;
      break;
    }
    digits[i] = 0;
    i--;
  }
  let all = digits.join("");
  if (i < 0) all = "1" + all;
  const intLen = all.length - decimals;
  return { int: all.slice(0, intLen) || "0", frac: all.slice(intLen) };
}

function shiftLeft2(int: string, frac: string): { int: string; frac: string } {
  const padded = int.padStart(3, "0");
  const newInt = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  return { int: newInt, frac: padded.slice(-2) + frac };
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface NumberOptions {
  columns: string[];
  /** Input uses a decimal comma (1.234,50) instead of a decimal point (1,234.50). */
  decimalComma: boolean;
  /** Fixed decimals for output; null keeps the precision the value had. */
  decimals: number | null;
  /** "keep": 12.5% stays 12.5%; "number": 12.5; "fraction": 0.125 */
  percent: "keep" | "number" | "fraction";
  /** Add comma thousands separators to the output. */
  thousandsSeparator: boolean;
}

export function formatNumberValue(p: ParsedNumber, opts: Pick<NumberOptions, "decimals" | "percent" | "thousandsSeparator">): string {
  let { int, frac } = p;
  if (p.percent && opts.percent === "fraction") {
    ({ int, frac } = shiftLeft2(int, frac));
    if (opts.decimals === null) frac = frac.replace(/0+$/, "");
  }
  // With decimals null the value keeps the precision it had (1,234.50 -> 1234.50).
  if (opts.decimals !== null) ({ int, frac } = roundDigits(int, frac, opts.decimals));
  const isZero = /^0*$/.test(int) && /^0*$/.test(frac);
  const sign = p.negative && !isZero ? "-" : "";
  const intOut = opts.thousandsSeparator ? groupThousands(int) : int;
  const suffix = p.percent && opts.percent === "keep" ? "%" : "";
  return `${sign}${intOut}${frac ? `.${frac}` : ""}${suffix}`;
}

export function formatNumbers(table: Table, opts: NumberOptions): OpResult {
  const warnings: string[] = [];
  if (opts.columns.length === 0) {
    warnings.push("No columns were chosen for number formatting.");
    return finishResult({ columns: table.columns.slice(), rows: table.rows.slice() }, { warnings });
  }
  const cols = resolveColumns(table, opts.columns, warnings);
  let bad = 0;
  const examples: string[] = [];
  const { table: out, changed } = mapCells(table, cols, (value) => {
    if (value.trim() === "") return value;
    const p = parseNumberCell(value, opts.decimalComma);
    if (!p) {
      bad++;
      if (examples.length < 3) examples.push(value.trim());
      return value;
    }
    return formatNumberValue(p, opts);
  });
  if (bad > 0) {
    warnings.push(
      `${bad} value(s) were not recognisable numbers and were left unchanged (e.g. ${examples.map((e) => `"${e}"`).join(", ")})${
        opts.decimalComma ? "" : ". If your file uses a decimal comma (1.234,50), turn on the decimal comma option"
      }.`,
    );
  }
  return finishResult(out, { changed, warnings });
}

/** Columns that look like formatted numbers (currency, separators, %), excluding ID-like columns with leading zeros. */
export function suggestNumberColumns(table: Table, decimalComma = false): string[] {
  const out: string[] = [];
  table.columns.forEach((name, c) => {
    let nonEmpty = 0;
    let ok = 0;
    let formatted = 0;
    let leadingZero = false;
    for (const row of table.rows) {
      const v = (row[c] ?? "").trim();
      if (v === "") continue;
      nonEmpty++;
      if (/^0\d/.test(v)) leadingZero = true;
      const p = parseNumberCell(v, decimalComma);
      if (p) {
        ok++;
        if (p.formatted || /[,]/.test(v)) formatted++;
      }
    }
    if (nonEmpty > 0 && !leadingZero && ok / nonEmpty >= 0.8 && formatted > 0) out.push(name);
  });
  return out;
}
