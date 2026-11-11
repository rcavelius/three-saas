import { finishResult, mapCells, resolveColumns, type OpResult, type Table } from "../types";

export interface FindReplaceOptions {
  find: string;
  replace: string;
  regex: boolean;
  caseSensitive: boolean;
  /** Only replace when the whole cell matches. */
  wholeCell: boolean;
  /** Empty = all columns. */
  columns: string[];
}

export const REGEX_LIMITS = {
  maxPatternLength: 300,
  /** Abort the step if it runs longer than this. */
  timeBudgetMs: 2000,
  /** Cells longer than this are skipped in regex mode. */
  maxCellLength: 20_000,
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reject patterns that are known to cause catastrophic backtracking: a quantified group whose body
 * itself contains a quantifier, e.g. (a+)+, (\w*)*, (x+|y)+. Returns an error message or null.
 */
export function checkRegexSafety(pattern: string): string | null {
  if (pattern.length > REGEX_LIMITS.maxPatternLength) return `The pattern is longer than ${REGEX_LIMITS.maxPatternLength} characters.`;
  // Strip escaped characters and character classes so their contents do not confuse the scan.
  const simplified = pattern.replace(/\\./g, "x").replace(/\[(?:\\.|[^\]])*\]/g, "x");
  const stack: { quantified: boolean }[] = [];
  for (let i = 0; i < simplified.length; i++) {
    const ch = simplified[i]!;
    if (ch === "(") stack.push({ quantified: false });
    else if (ch === ")") {
      const group = stack.pop();
      const next = simplified[i + 1];
      const groupRepeated = next === "*" || next === "+" || next === "{";
      if (group?.quantified && groupRepeated) {
        return "The pattern repeats a group that already contains a repeat (like (a+)+). That can freeze the browser, so it was not run. Simplify the pattern.";
      }
      if (stack.length > 0 && (group?.quantified || groupRepeated)) stack[stack.length - 1]!.quantified = true;
    } else if ((ch === "*" || ch === "+" || ch === "{") && stack.length > 0) {
      stack[stack.length - 1]!.quantified = true;
    }
  }
  if (/\\[1-9]/.test(pattern) && /[*+]/.test(pattern)) {
    return "Back-references combined with repeats can be very slow, so this pattern was not run.";
  }
  return null;
}

export function buildMatcher(opts: Pick<FindReplaceOptions, "find" | "regex" | "caseSensitive" | "wholeCell">): RegExp {
  if (opts.find === "") throw new Error("Enter text to find.");
  let source = opts.regex ? opts.find : escapeRegex(opts.find);
  if (opts.regex) {
    const problem = checkRegexSafety(opts.find);
    if (problem) throw new Error(problem);
  }
  if (opts.wholeCell) source = `^(?:${source})$`;
  const flags = `${opts.caseSensitive ? "" : "i"}${opts.wholeCell ? "" : "g"}`;
  try {
    return new RegExp(source, flags);
  } catch (e) {
    throw new Error(`Invalid pattern: ${(e as Error).message}`);
  }
}

export function findReplace(table: Table, opts: FindReplaceOptions): OpResult {
  const warnings: string[] = [];
  const re = buildMatcher(opts);
  const cols = resolveColumns(table, opts.columns, warnings);
  const started = Date.now();
  let checked = 0;
  let skippedLong = 0;
  let timedOut = false;
  const result = mapCells(table, cols, (value) => {
    if (timedOut) return value;
    if (++checked % 500 === 0 && Date.now() - started > REGEX_LIMITS.timeBudgetMs) {
      timedOut = true;
      return value;
    }
    if (opts.regex && value.length > REGEX_LIMITS.maxCellLength) {
      skippedLong++;
      return value;
    }
    re.lastIndex = 0;
    if (!re.test(value)) return value;
    re.lastIndex = 0;
    // Literal mode: the replacement is literal too ($ has no special meaning).
    return opts.regex ? value.replace(re, opts.replace) : value.replace(re, () => opts.replace);
  });
  if (timedOut) {
    return finishResult(
      { columns: table.columns.slice(), rows: table.rows.slice() },
      { warnings: [...warnings, `Find & replace took longer than ${REGEX_LIMITS.timeBudgetMs / 1000} s and was stopped. Nothing was changed by this step.`] },
    );
  }
  if (skippedLong > 0) warnings.push(`${skippedLong} very long cell(s) were skipped by the pattern search.`);
  return finishResult(result.table, { changed: result.changed, warnings });
}
