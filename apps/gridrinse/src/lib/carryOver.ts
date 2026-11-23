/**
 * Keeps the visitor's work across the Stripe Checkout round trip for a pass (leaving the page for checkout
 * would otherwise lose the loaded file and the steps).
 *
 * Everything stays in THIS browser: the steps and settings go to sessionStorage (this tab only), the loaded
 * files' bytes to IndexedDB. Nothing is sent anywhere: files are never uploaded. The saved copy is taken
 * (read and deleted) when the visitor comes back, is ignored after a few hours, and "Start over" deletes it.
 * Every storage access is guarded; when IndexedDB is unavailable only the steps survive and the visitor is
 * told to drop the file again.
 */
import { makeWorkflow, parseWorkflow, type Step } from "./engine/schema";

const META_KEY = "gridrinse.carryover.v1";
/** localStorage marker that files were put in IndexedDB, so a copy left behind by a closed tab is found and deleted. */
const PENDING_KEY = "gridrinse.carryover.pending";
const DB_NAME = "gridrinse-carryover";
const STORE = "files";
const RECORD = "pending";
/** A checkout that takes longer than this is treated as abandoned. */
export const CARRY_OVER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface CarryFile {
  name: string;
  bytes: Uint8Array;
  sheet?: string;
  dateMode: "display" | "iso";
  hasHeader: boolean;
}

export interface CarryMeta {
  savedAt: number;
  steps: Step[];
  mode: "merge" | "batch";
  merge: { looseMatch: boolean; addSource: boolean; sourceName: string };
  csvOpts: { delimiter: string; bom: boolean; lineEnding: "crlf" | "lf"; guardFormulas: boolean };
  activeIndex: number;
  /** Number of files that were loaded (their bytes may or may not have been kept). */
  fileCount: number;
}

export interface CarryOver {
  meta: CarryMeta;
  /** null when the files could not be kept (or there were none): drop them again. */
  files: CarryFile[] | null;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => {
            db.close();
            resolve((req.result ?? null) as T | null);
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      }),
  );
}

/** Saves the steps (always) and the files (when IndexedDB works). Resolves to whether the files were kept. */
export async function saveCarryOver(meta: Omit<CarryMeta, "savedAt" | "fileCount">, files: CarryFile[]): Promise<{ filesKept: boolean }> {
  const savedAt = Date.now();
  try {
    const wf = makeWorkflow("carry-over", meta.steps);
    window.sessionStorage.setItem(META_KEY, JSON.stringify({ ...meta, steps: wf, savedAt, fileCount: files.length }));
  } catch {
    /* sessionStorage blocked: nothing can be kept */
  }
  if (files.length === 0) return { filesKept: false };
  const stored = await idb("readwrite", (s) =>
    s.put(
      { savedAt, files: files.map((f) => ({ name: f.name, bytes: f.bytes.slice().buffer, sheet: f.sheet, dateMode: f.dateMode, hasHeader: f.hasHeader })) },
      RECORD,
    ),
  );
  const filesKept = stored !== null;
  if (filesKept) {
    try {
      window.localStorage.setItem(PENDING_KEY, String(savedAt));
    } catch {
      /* ignore */
    }
  }
  return { filesKept };
}

/**
 * Deletes files left in IndexedDB by a tab that was closed during checkout (its sessionStorage, and with it the
 * way back, is gone). Cheap when there is nothing to do: IndexedDB is only opened when the marker is set.
 */
export async function sweepCarryOver(): Promise<void> {
  let pending: string | null = null;
  try {
    pending = window.localStorage.getItem(PENDING_KEY);
  } catch {
    return;
  }
  if (pending === null || hasCarryOver()) return;
  await clearCarryOver();
}

/** True when a saved state is waiting (cheap check, sessionStorage only). */
export function hasCarryOver(): boolean {
  try {
    return window.sessionStorage.getItem(META_KEY) !== null;
  } catch {
    return false;
  }
}

/** Reads and deletes the saved state. null when there is none (or it is too old or unreadable). */
export async function takeCarryOver(now = Date.now()): Promise<CarryOver | null> {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(META_KEY);
  } catch {
    raw = null;
  }
  const record = await idb<{ savedAt: number; files: { name: string; bytes: ArrayBuffer; sheet?: string; dateMode: "display" | "iso"; hasHeader: boolean }[] }>("readonly", (s) => s.get(RECORD));
  await clearCarryOver();
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Omit<CarryMeta, "steps"> & { steps: unknown };
    if (typeof m.savedAt !== "number" || now - m.savedAt > CARRY_OVER_MAX_AGE_MS) return null;
    const wf = parseWorkflow(m.steps);
    if (!wf.ok) return null;
    const meta: CarryMeta = {
      savedAt: m.savedAt,
      steps: wf.workflow.steps,
      mode: m.mode === "batch" ? "batch" : "merge",
      merge: { looseMatch: m.merge?.looseMatch !== false, addSource: m.merge?.addSource !== false, sourceName: String(m.merge?.sourceName ?? "source_file").slice(0, 80) },
      csvOpts: {
        delimiter: [",", ";", "\t"].includes(m.csvOpts?.delimiter) ? m.csvOpts.delimiter : ",",
        bom: m.csvOpts?.bom !== false,
        lineEnding: m.csvOpts?.lineEnding === "lf" ? "lf" : "crlf",
        guardFormulas: m.csvOpts?.guardFormulas === true,
      },
      activeIndex: Number.isInteger(m.activeIndex) ? m.activeIndex : 0,
      fileCount: Number.isInteger(m.fileCount) ? m.fileCount : 0,
    };
    const files =
      record && record.savedAt === m.savedAt && Array.isArray(record.files) && record.files.length
        ? record.files.map((f) => ({ name: f.name, bytes: new Uint8Array(f.bytes), sheet: f.sheet, dateMode: f.dateMode === "iso" ? ("iso" as const) : ("display" as const), hasHeader: f.hasHeader !== false }))
        : null;
    return { meta, files };
  } catch {
    return null;
  }
}

/** Deletes any saved state (both stores). */
export async function clearCarryOver(): Promise<void> {
  try {
    window.sessionStorage.removeItem(META_KEY);
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
  await idb("readwrite", (s) => s.delete(RECORD));
}
