/**
 * Tiny, dependency-free helpers the page itself needs. They live here (not in parse.ts / zip.ts) so that
 * importing them on the main thread does not pull SheetJS, Papa Parse or fflate into the page bundle:
 * those libraries belong in the engine worker only.
 */

export type FileKind = "csv" | "workbook" | "unsupported";

export function detectKind(fileName: string): FileKind {
  const lower = fileName.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(lower)) return "csv";
  if (/\.(xlsx|xlsm|xls|ods)$/.test(lower)) return "workbook";
  return "unsupported";
}

export function zipFileName(now = new Date()): string {
  return `gridrinse-batch-${now.toISOString().slice(0, 10)}.zip`;
}
