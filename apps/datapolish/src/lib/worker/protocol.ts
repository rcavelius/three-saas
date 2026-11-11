/**
 * Messages between the page and the engine worker. `handleRequest` is the single implementation used
 * both inside the Web Worker and (as a fallback) on the main thread, so behaviour is identical.
 * Nothing here touches the network: inputs arrive as bytes/tables from the page and go back the same way.
 */
import { toCsv, toXlsx, type CsvExportOptions } from "../engine/export";
import { mergeTables, type MergeOptions, type MergeReport } from "../engine/merge";
import { suggestNumberColumns } from "../engine/ops/numbers";
import { analyzeDateColumn } from "../engine/ops/dates";
import { parseFileBytes, type ParseFileOptions, type ParseResult } from "../engine/parse";
import { runPipeline, type PipelineResult } from "../engine/pipeline";
import type { Step } from "../engine/schema";
import type { Table } from "../engine/types";
import { batchZip, type ZipFormat } from "../engine/zip";

export interface Suggestions {
  numberColumns: string[];
  dateColumns: string[];
}

/** Checked in the worker right after parsing, BEFORE the table is copied back to the page. */
export interface ParseLimits {
  maxRows: number;
  maxCells: number;
  planName: string;
}

export type EngineRequest =
  | { kind: "parse"; name: string; bytes: Uint8Array; options: ParseFileOptions; limits?: ParseLimits }
  | { kind: "run"; inputs: { name: string; table: Table }[]; merge: MergeOptions | null; steps: Step[] }
  | { kind: "csv"; table: Table; options: CsvExportOptions }
  | { kind: "xlsx"; sheets: { name: string; table: Table }[] }
  | { kind: "zip"; files: { name: string; table: Table }[]; format: ZipFormat; csv: CsvExportOptions };

export interface ParseResponse extends ParseResult {
  encoding?: string;
  suggestions: Suggestions;
}

export interface RunResponse {
  /** The table the pipeline started from (the merged table in merge mode). */
  input: Table;
  mergeReport: MergeReport | null;
  result: PipelineResult;
}

export type EngineResponse = ParseResponse | RunResponse | string | Uint8Array;

export function suggest(table: Table): Suggestions {
  const dateColumns = table.columns.filter((_, c) => analyzeDateColumn(table.rows.map((r) => r[c] ?? "")).isDateColumn);
  return { numberColumns: suggestNumberColumns(table).filter((c) => !dateColumns.includes(c)), dateColumns };
}

export function handleRequest(req: EngineRequest): EngineResponse {
  switch (req.kind) {
    case "parse": {
      const res = parseFileBytes(req.name, req.bytes, req.options);
      if (req.limits) {
        const rows = res.table.rows.length;
        const cells = rows * Math.max(1, res.table.columns.length);
        if (rows > req.limits.maxRows) {
          throw new Error(`${req.name} has ${rows.toLocaleString("en-US")} rows; your plan (${req.limits.planName}) handles up to ${req.limits.maxRows.toLocaleString("en-US")} rows per file.`);
        }
        if (cells > req.limits.maxCells) {
          throw new Error(
            `${req.name} has ${cells.toLocaleString("en-US")} cells (${rows.toLocaleString("en-US")} rows × ${res.table.columns.length} columns), more than this browser tab can safely clean right now (${req.limits.maxCells.toLocaleString("en-US")}). Remove a file, drop columns before export, or split the file.`,
          );
        }
      }
      return { ...res, suggestions: suggest(res.table) };
    }
    case "run": {
      let input: Table;
      let mergeReport: MergeReport | null = null;
      if (req.merge && req.inputs.length > 1) {
        const merged = mergeTables(req.inputs, req.merge);
        input = merged.table;
        mergeReport = merged.report;
      } else {
        input = req.inputs[0]?.table ?? { columns: [], rows: [] };
      }
      return { input, mergeReport, result: runPipeline(input, req.steps) };
    }
    case "csv":
      return toCsv(req.table, req.options);
    case "xlsx":
      return toXlsx(req.sheets);
    case "zip":
      return batchZip(req.files, req.format, req.csv);
  }
}

export interface WorkerEnvelope {
  id: number;
  request: EngineRequest;
}

export type WorkerReply = { id: number; ok: true; value: EngineResponse } | { id: number; ok: false; error: string };
