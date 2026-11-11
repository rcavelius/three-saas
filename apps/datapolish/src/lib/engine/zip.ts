/**
 * ZIP export for batch results, built in the browser (inside the engine worker) with fflate's
 * streaming Zip: each file is encoded and pushed into the archive one at a time, so only one cleaned
 * file plus the compressed output is held at once. Nothing is uploaded.
 */
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { toCsv, toXlsx, type CsvExportOptions } from "./export";
import type { Table } from "./types";

export type ZipFormat = "csv" | "xlsx";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A safe file name for an archive entry: no folders, control or reserved characters, bounded length. */
export function safeEntryBase(name: string): string {
  let base = name
    .replace(/\.[^.]{1,8}$/, "") // drop the original extension
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[\s._]+|[\s._]+$/g, "")
    .slice(0, 80);
  if (!base || WINDOWS_RESERVED.test(base)) base = `file${base ? `_${base}` : ""}`;
  return base;
}

/** Unique entry names: "<base>-clean.<ext>", then "<base>-clean (2).<ext>" ... (case-insensitive). */
export function zipEntryNames(fileNames: string[], ext: string): string[] {
  const used = new Set<string>();
  return fileNames.map((n) => {
    const base = `${safeEntryBase(n)}-clean`;
    let candidate = `${base}.${ext}`;
    let i = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base} (${i++}).${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Streams entries into one archive. `compress: false` stores already-compressed data (XLSX) as is. */
export function buildZip(entries: Iterable<{ name: string; data: () => Uint8Array; compress: boolean }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else chunks.push(chunk);
  });
  for (const e of entries) {
    const file = e.compress ? new ZipDeflate(e.name, { level: 6 }) : new ZipPassThrough(e.name);
    zip.add(file);
    file.push(e.data(), true); // generated lazily: one file in memory at a time
    if (failure) throw failure;
  }
  zip.end();
  if (failure) throw failure;
  return concat(chunks);
}

/** One CSV or XLSX per cleaned table, zipped. */
export function batchZip(files: { name: string; table: Table }[], format: ZipFormat, csv: CsvExportOptions = {}): Uint8Array {
  const ext = format === "xlsx" ? "xlsx" : csv.delimiter === "\t" ? "tsv" : "csv";
  const names = zipEntryNames(
    files.map((f) => f.name),
    ext,
  );
  const encoder = new TextEncoder();
  return buildZip(
    files.map((f, i) => ({
      name: names[i]!,
      compress: format !== "xlsx",
      data: () => (format === "xlsx" ? toXlsx([{ name: f.name, table: f.table }]) : encoder.encode(toCsv(f.table, csv))),
    })),
  );
}

export function zipFileName(now = new Date()): string {
  return `datapolish-batch-${now.toISOString().slice(0, 10)}.zip`;
}
