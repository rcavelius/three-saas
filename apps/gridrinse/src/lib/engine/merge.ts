import type { Table } from "./types";

export interface MergeInput {
  name: string;
  table: Table;
}

export interface MergeOptions {
  /**
   * Explicit mapping per input file (same order as inputs): source column -> target column.
   * Map a column to "" to leave it out of the merged table.
   */
  mappings?: Array<Record<string, string> | undefined>;
  /** Match headers that differ only in case, spaces or punctuation ("E-mail" = "email"). */
  looseMatch: boolean;
  /** Name of a column recording which file each row came from; null for none. */
  sourceColumn: string | null;
}

export interface MergeReport {
  rowsPerFile: number[];
  /** Target columns that some files did not have (their cells are left empty). */
  missing: Record<string, string[]>;
  /** For each file: source column -> target column it was placed in ("" = dropped). */
  placements: Record<string, string>[];
  warnings: string[];
}

export function headerKey(name: string): string {
  return name
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Stack several tables into one, aligning columns by name. The result has the union of all columns. */
export function mergeTables(inputs: MergeInput[], opts: MergeOptions): { table: Table; report: MergeReport } {
  const columns: string[] = [];
  const keyToColumn = new Map<string, string>();
  const placements: Record<string, string>[] = [];
  const warnings: string[] = [];

  const targetFor = (col: string): string => {
    if (columns.includes(col)) return col;
    if (opts.looseMatch) {
      const hit = keyToColumn.get(headerKey(col));
      if (hit) return hit;
    }
    columns.push(col);
    if (!keyToColumn.has(headerKey(col))) keyToColumn.set(headerKey(col), col);
    return col;
  };

  inputs.forEach((input, fi) => {
    const explicit = opts.mappings?.[fi] ?? {};
    const placement: Record<string, string> = {};
    for (const col of input.table.columns) {
      const mapped = explicit[col];
      if (mapped !== undefined) {
        placement[col] = mapped.trim() === "" ? "" : targetFor(mapped.trim());
      } else {
        placement[col] = targetFor(col);
      }
    }
    // Two source columns landing in the same target would overwrite each other: keep the first, warn.
    const seen = new Set<string>();
    for (const col of input.table.columns) {
      const t = placement[col]!;
      if (t === "") continue;
      if (seen.has(t)) {
        warnings.push(`In ${input.name}, "${col}" maps to "${t}" which another column already fills; "${col}" was left out.`);
        placement[col] = "";
      } else seen.add(t);
    }
    placements.push(placement);
  });

  let sourceCol: string | null = null;
  if (opts.sourceColumn && opts.sourceColumn.trim() !== "") {
    sourceCol = opts.sourceColumn.trim();
    let n = 2;
    while (columns.includes(sourceCol)) sourceCol = `${opts.sourceColumn.trim()}_${n++}`;
  }
  const finalColumns = sourceCol ? [...columns, sourceCol] : [...columns];
  const index = new Map(finalColumns.map((c, i) => [c, i]));
  const rows: string[][] = [];
  const missing: Record<string, string[]> = {};
  inputs.forEach((input, fi) => {
    const placement = placements[fi]!;
    const filled = new Set(Object.values(placement).filter(Boolean));
    for (const c of columns) {
      if (!filled.has(c)) (missing[c] ??= []).push(input.name);
    }
    const pairs = input.table.columns
      .map((col, ci) => [ci, placement[col] ? index.get(placement[col]!) : undefined] as const)
      .filter((p): p is readonly [number, number] => p[1] !== undefined);
    for (const r of input.table.rows) {
      const out = Array<string>(finalColumns.length).fill("");
      for (const [ci, ti] of pairs) out[ti] = r[ci] ?? "";
      // Blank source rows stay fully blank so "Remove blank rows" still recognises them after merging.
      if (sourceCol && !r.every((v) => v.trim() === "")) out[finalColumns.length - 1] = input.name;
      rows.push(out);
    }
  });
  for (const [col, files] of Object.entries(missing)) {
    warnings.push(`Column "${col}" is missing from ${files.join(", ")}; those rows have it empty.`);
  }
  return {
    table: { columns: finalColumns, rows },
    report: { rowsPerFile: inputs.map((i) => i.table.rows.length), missing, placements, warnings },
  };
}
