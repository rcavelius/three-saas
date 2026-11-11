import { finishResult, mapCells, resolveColumns, type OpResult, type Table } from "../types";

export type DateOrder = "DMY" | "MDY";

export interface SimpleDate {
  y: number;
  m: number;
  d: number;
  /** Original time text, kept verbatim (no timezone conversion). */
  time?: string;
}

/** One parsed cell. "numeric" values (03/04/2024) need a day/month order to become a date. */
export type DateCandidate =
  | { kind: "date"; date: SimpleDate }
  | { kind: "numeric"; a: number; b: number; y: number; time?: string };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthFromName(name: string): number | null {
  const n = name.toLowerCase().replace(/\.$/, "");
  if (n.length < 3) return null;
  const idx = MONTHS.findIndex((m) => m.startsWith(n) || (n === "sept" && m === "september"));
  return idx === -1 ? null : idx + 1;
}

const TIME_RE = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[ap]\.?m\.?)?\s*(?:z|utc|gmt|[+-]\d{2}:?\d{2})?$/i;

function validTime(t: string | undefined): boolean {
  return t === undefined || TIME_RE.test(t.trim());
}

export function expandYear(y: string, pivot: number): number {
  if (y.length === 4) return Number(y);
  const n = Number(y);
  return n < pivot ? 2000 + n : 1900 + n;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidDate(y: number, m: number, d: number): boolean {
  return y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function dateOrNull(y: number, m: number, d: number, time?: string): DateCandidate | null {
  return isValidDate(y, m, d) ? { kind: "date", date: time ? { y, m, d, time } : { y, m, d } } : null;
}

const WEEKDAY_PREFIX = /^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i;

/**
 * Parse one cell. Returns null if it is not a recognised date.
 * Dotted numeric dates (05.01.2024) follow the day.month.year convention and are not treated as ambiguous.
 */
export function parseDateCell(raw: string, pivot = 50): DateCandidate | null {
  const s = raw.trim();
  if (s === "") return null;
  let m: RegExpMatchArray | null;

  // ISO and year-first: 2024-01-05, 2024/1/5, 2024-01-05T10:30:00Z, 2024-01-05 10:30
  if ((m = s.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:(?:T|\s+)(.+))?$/))) {
    const time = m[5];
    if (!validTime(time)) return null;
    return dateOrNull(Number(m[1]), Number(m[3]), Number(m[4]), time);
  }
  // Compact ISO: 20240105 is too easily a plain number; not parsed.

  // Numeric day/month/year or month/day/year
  if ((m = s.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?:(?:T|\s+)(.+))?$/))) {
    const time = m[5];
    if (!validTime(time)) return null;
    const a = Number(m[1]);
    const b = Number(m[3]);
    const y = expandYear(m[4]!, pivot);
    if (m[2] === ".") return dateOrNull(y, b, a, time); // d.m.y convention
    const asDmy = isValidDate(y, b, a);
    const asMdy = isValidDate(y, a, b);
    if (!asDmy && !asMdy) return null;
    if (asDmy && !asMdy) return dateOrNull(y, b, a, time);
    if (asMdy && !asDmy) return dateOrNull(y, a, b, time);
    if (a === b) return dateOrNull(y, a, b, time); // 05/05/2024 is the same either way
    return time ? { kind: "numeric", a, b, y, time } : { kind: "numeric", a, b, y };
  }

  const t = s.replace(WEEKDAY_PREFIX, "");
  // Month name first: Jan 5, 2024 / January 5th 2024 / Jan-05-2024
  if ((m = t.match(/^([A-Za-z]{3,9}\.?)[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4}|\d{2})(?:(?:,?\s+|T)(.+))?$/))) {
    const month = monthFromName(m[1]!);
    if (month === null || !validTime(m[4])) return null;
    return dateOrNull(expandYear(m[3]!, pivot), month, Number(m[2]), m[4]);
  }
  // Day first with month name: 5 Jan 2024 / 05-Jan-24 / 5th January, 2024
  if ((m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9}\.?),?[\s-]+(\d{4}|\d{2})(?:(?:,?\s+|T)(.+))?$/))) {
    const month = monthFromName(m[2]!);
    if (month === null || !validTime(m[4])) return null;
    return dateOrNull(expandYear(m[3]!, pivot), month, Number(m[1]), m[4]);
  }
  return null;
}

/** Excel serial day number (1900 system) to a date. Fractions become HH:mm:ss. */
export function excelSerialToDate(serial: number): SimpleDate | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  let whole = Math.floor(serial);
  if (whole === 60) return { y: 1900, m: 2, d: 29 }; // Excel's fictional 1900-02-29
  if (whole < 60) whole += 1; // Excel thinks 1900 was a leap year; serials before it are off by one
  const ms = Date.UTC(1899, 11, 30) + whole * 86400000;
  const dt = new Date(ms);
  const out: SimpleDate = { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  const frac = serial - Math.floor(serial);
  if (frac > 0) {
    const secs = Math.round(frac * 86400);
    const hh = Math.floor(secs / 3600) % 24;
    const mm = Math.floor((secs % 3600) / 60);
    const ss = secs % 60;
    out.time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return out;
}

const SERIAL_RE = /^\d{1,7}(?:\.\d+)?$/;

export interface DateColumnAnalysis {
  nonEmpty: number;
  /** Values that parse as a date under at least one order. */
  parseable: number;
  /** Values only valid as month-first (second number > 12). */
  mdyOnly: number;
  /** Values only valid as day-first (first number > 12). */
  dmyOnly: number;
  /** Numeric values valid either way (e.g. 03/04/2024). */
  ambiguous: number;
  isDateColumn: boolean;
  /** Order implied by the data, or null if the data cannot tell. */
  impliedOrder: DateOrder | null;
  /** Both day-first and month-first evidence in one column. */
  conflict: boolean;
  examples: string[];
}

export function analyzeDateColumn(values: readonly string[], pivot = 50, excelSerials = false): DateColumnAnalysis {
  let nonEmpty = 0;
  let parseable = 0;
  let mdyOnly = 0;
  let dmyOnly = 0;
  let ambiguous = 0;
  const examples: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (v === "") continue;
    nonEmpty++;
    if (excelSerials && SERIAL_RE.test(v) && excelSerialToDate(Number(v))) {
      parseable++;
      continue;
    }
    const s = v.match(/^(\d{1,2})([-/])(\d{1,2})\2(\d{4}|\d{2})\b/);
    const c = parseDateCell(v, pivot);
    if (!c) continue;
    parseable++;
    if (c.kind === "numeric") {
      ambiguous++;
      if (examples.length < 3) examples.push(v);
    } else if (s) {
      const a = Number(s[1]);
      const b = Number(s[3]);
      if (a > 12 && b <= 12) dmyOnly++;
      else if (b > 12 && a <= 12) mdyOnly++;
    }
  }
  const conflict = mdyOnly > 0 && dmyOnly > 0;
  const impliedOrder: DateOrder | null = conflict ? null : dmyOnly > 0 ? "DMY" : mdyOnly > 0 ? "MDY" : null;
  return {
    nonEmpty,
    parseable,
    mdyOnly,
    dmyOnly,
    ambiguous,
    isDateColumn: nonEmpty > 0 && parseable / nonEmpty >= 0.8,
    impliedOrder,
    conflict,
    examples,
  };
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** Format a date with tokens YYYY YY MMMM MMM MM M DD D. Anything else is copied literally. */
export function formatDate(date: SimpleDate, format: string): string {
  const tokens = /YYYY|YY|MMMM|MMM|MM|M|DD|D/g;
  return format.replace(tokens, (tok) => {
    switch (tok) {
      case "YYYY":
        return pad(date.y, 4);
      case "YY":
        return pad(date.y % 100);
      case "MMMM": {
        const name = MONTHS[date.m - 1]!;
        return name.charAt(0).toUpperCase() + name.slice(1);
      }
      case "MMM":
        return MONTH_ABBR[date.m - 1]!;
      case "MM":
        return pad(date.m);
      case "M":
        return String(date.m);
      case "DD":
        return pad(date.d);
      default:
        return String(date.d);
    }
  });
}

export interface DateOptions {
  /** Columns to convert; null = detect date columns automatically. */
  columns: string[] | null;
  /** Day/month order for ambiguous numeric dates: "auto" uses only what the data proves. */
  order: "auto" | DateOrder;
  /** Per-column order chosen by the user; overrides `order`. */
  orderByColumn: Record<string, DateOrder>;
  outputFormat: string;
  /** Treat plain numbers in the chosen columns as Excel serial dates (only with explicit columns). */
  excelSerials: boolean;
  /** Keep any time-of-day text after the date. */
  keepTime: boolean;
  /** Two-digit years below this become 20xx, otherwise 19xx. */
  twoDigitYearPivot: number;
}

export interface DateNeedsChoice {
  column: string;
  reason: "ambiguous" | "conflict";
  examples: string[];
}

export function formatDates(table: Table, opts: DateOptions): OpResult {
  const warnings: string[] = [];
  const pivot = opts.twoDigitYearPivot;
  const explicit = opts.columns !== null && opts.columns.length > 0;
  const serials = explicit && opts.excelSerials;
  let cols = explicit ? resolveColumns(table, opts.columns, warnings) : table.columns.map((_, i) => i);
  const analyses = new Map<number, DateColumnAnalysis>();
  for (const c of cols) analyses.set(c, analyzeDateColumn(table.rows.map((r) => r[c] ?? ""), pivot, serials));
  if (!explicit) cols = cols.filter((c) => analyses.get(c)!.isDateColumn);

  const needsChoice: DateNeedsChoice[] = [];
  const orders = new Map<number, DateOrder | null>();
  for (const c of cols) {
    const name = table.columns[c]!;
    const a = analyses.get(c)!;
    const chosen = opts.orderByColumn[name] ?? (opts.order === "auto" ? null : opts.order);
    if (chosen) {
      orders.set(c, chosen);
      continue;
    }
    if (a.conflict) {
      needsChoice.push({ column: name, reason: "conflict", examples: a.examples });
      warnings.push(
        `Column "${name}" mixes day-first and month-first dates (${a.dmyOnly} only make sense as day/month, ${a.mdyOnly} only as month/day). It was left unchanged: choose DMY or MDY for it.`,
      );
      orders.set(c, null);
      continue;
    }
    if (a.ambiguous > 0 && a.impliedOrder === null) {
      needsChoice.push({ column: name, reason: "ambiguous", examples: a.examples });
      warnings.push(
        `Column "${name}" has dates such as ${a.examples.join(", ")} that could be day/month or month/day, and nothing in the column settles it. It was left unchanged: choose DMY or MDY for it.`,
      );
      orders.set(c, null);
      continue;
    }
    orders.set(c, a.impliedOrder ?? "MDY");
  }

  let unparsed = 0;
  const unparsedExamples: string[] = [];
  const active = cols.filter((c) => !needsChoice.some((n) => n.column === table.columns[c]));
  const { table: out, changed } = mapCells(table, active, (value, _r, c) => {
    const v = value.trim();
    if (v === "") return value;
    let date: SimpleDate | null = null;
    if (serials && SERIAL_RE.test(v)) date = excelSerialToDate(Number(v));
    if (!date) {
      const cand = parseDateCell(v, pivot);
      if (cand?.kind === "date") date = cand.date;
      else if (cand?.kind === "numeric") {
        const order = orders.get(c);
        if (order === "DMY" && isValidDate(cand.y, cand.b, cand.a)) date = { y: cand.y, m: cand.b, d: cand.a, time: cand.time };
        else if (order === "MDY" && isValidDate(cand.y, cand.a, cand.b)) date = { y: cand.y, m: cand.a, d: cand.b, time: cand.time };
      }
      // A user-chosen order must also apply to values the parser resolved on its own,
      // e.g. 13/04/2024 under MDY is invalid and is left as-is rather than silently flipped.
      if (date && cand?.kind === "date") {
        const order = orders.get(c);
        const sm = v.match(/^(\d{1,2})([-/])(\d{1,2})\2(\d{4}|\d{2})\b/);
        if (sm && order) {
          const a = Number(sm[1]);
          const b = Number(sm[3]);
          const y = expandYear(sm[4]!, pivot);
          const ok = order === "DMY" ? isValidDate(y, b, a) : isValidDate(y, a, b);
          if (!ok) date = null;
          else date = order === "DMY" ? { y, m: b, d: a, time: date.time } : { y, m: a, d: b, time: date.time };
        }
      }
    }
    if (!date) {
      unparsed++;
      if (unparsedExamples.length < 3) unparsedExamples.push(v);
      return value;
    }
    let text = formatDate(date, opts.outputFormat);
    if (opts.keepTime && date.time) text += ` ${date.time.trim()}`;
    return text;
  });
  if (unparsed > 0) {
    warnings.push(`${unparsed} value(s) in date columns could not be read as dates and were left unchanged (e.g. ${unparsedExamples.map((e) => `"${e}"`).join(", ")}).`);
  }
  return finishResult(out, {
    changed,
    warnings,
    details: { dateColumns: cols.map((c) => table.columns[c]!), needsChoice },
  });
}
