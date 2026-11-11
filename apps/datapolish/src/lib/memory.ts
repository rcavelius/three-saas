/**
 * Browser-memory safeguards. Parsing turns file bytes into JS strings and arrays, which take several
 * times more memory than the file; cleaning keeps the input and the result side by side. These
 * estimates are deliberately pessimistic: the goal is a clear message BEFORE the tab can crash.
 */
import { ABSOLUTE_LIMITS, formatBytes } from "./limits";

const GB = 1024 * 1024 * 1024;

/** Heap bytes needed per byte of file while parsing + cleaning (input table, result, change flags, copies). */
export const EXPANSION = { text: 8, spreadsheet: 30 } as const;
/** Heap bytes per cell once parsed (array slot + string header + typical short string), with input+result+transfer copies. */
export const BYTES_PER_CELL = 160;

export interface MemoryBudget {
  bytes: number;
  source: "deviceMemory" | "heapLimit" | "default";
}

interface NavLike {
  deviceMemory?: number;
}
interface PerfLike {
  memory?: { jsHeapSizeLimit?: number };
}

/**
 * How much memory this tab can reasonably use. navigator.deviceMemory (GB, rounded, capped at 8 by
 * browsers) and Chromium's jsHeapSizeLimit are used when available; otherwise 1 GB is assumed.
 */
export function memoryBudget(nav: NavLike | undefined = typeof navigator !== "undefined" ? (navigator as NavLike) : undefined, perf: PerfLike | undefined = typeof performance !== "undefined" ? (performance as PerfLike) : undefined): MemoryBudget {
  const candidates: MemoryBudget[] = [];
  const dm = nav?.deviceMemory;
  if (typeof dm === "number" && dm > 0) candidates.push({ bytes: dm * GB * 0.4, source: "deviceMemory" });
  const heap = perf?.memory?.jsHeapSizeLimit;
  if (typeof heap === "number" && heap > 0) candidates.push({ bytes: heap * 0.7, source: "heapLimit" });
  if (candidates.length === 0) return { bytes: 1 * GB, source: "default" };
  return candidates.reduce((a, b) => (b.bytes < a.bytes ? b : a));
}

export function estimateFileMemory(bytes: number, kind: "csv" | "xlsx"): number {
  return bytes * (kind === "xlsx" ? EXPANSION.spreadsheet : EXPANSION.text);
}

export function estimateCellsMemory(cells: number): number {
  return cells * BYTES_PER_CELL;
}

export type MemoryVerdict = { level: "ok" } | { level: "warn" | "refuse"; message: string };

/**
 * Checks a new file before it is read. `inUse` = estimated memory of files already loaded.
 * refuse: the estimate exceeds the budget or the absolute caps. warn: above 60% of the budget.
 */
export function checkBeforeParse(o: { name: string; bytes: number; kind: "csv" | "xlsx"; inUseBytes: number; loadedFileBytes: number; budget: MemoryBudget }): MemoryVerdict {
  if (o.bytes > ABSOLUTE_LIMITS.fileBytes) {
    return { level: "refuse", message: `${o.name} is ${formatBytes(o.bytes)}; a browser tab can safely clean files up to ${formatBytes(ABSOLUTE_LIMITS.fileBytes)}. Split the file into parts.` };
  }
  if (o.loadedFileBytes + o.bytes > ABSOLUTE_LIMITS.totalBytes) {
    return { level: "refuse", message: `Loading ${o.name} would put ${formatBytes(o.loadedFileBytes + o.bytes)} of files in this tab; the safe maximum is ${formatBytes(ABSOLUTE_LIMITS.totalBytes)}. Remove a file or clean them in smaller batches.` };
  }
  const need = o.inUseBytes + estimateFileMemory(o.bytes, o.kind);
  const have = o.budget.bytes;
  if (need > have) {
    return {
      level: "refuse",
      message: `${o.name} would need about ${formatBytes(need)} of memory to clean, and this browser tab has about ${formatBytes(have)}${o.budget.source === "default" ? " (estimated)" : ""}. To avoid crashing the tab it was not opened. Split the file, close other tabs, or use a computer with more memory.`,
    };
  }
  if (need > have * 0.6) {
    return { level: "warn", message: `${o.name} is large for this device (about ${formatBytes(need)} of ${formatBytes(have)} available memory). Cleaning may be slow; use Cancel if the page stops responding.` };
  }
  return { level: "ok" };
}

/** Per-file cell cap for the worker, from the remaining memory budget and the absolute caps. */
export function maxCellsFor(budget: MemoryBudget, inUseBytes: number, loadedCells: number): number {
  const byMemory = Math.floor(Math.max(0, budget.bytes - inUseBytes) / BYTES_PER_CELL);
  return Math.max(0, Math.min(ABSOLUTE_LIMITS.cells, ABSOLUTE_LIMITS.totalCells - loadedCells, byMemory));
}
