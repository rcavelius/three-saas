import type { CsvExportOptions } from "../engine/export";
import type { MergeOptions } from "../engine/merge";
import type { ParseFileOptions } from "../engine/parse";
import type { Step } from "../engine/schema";
import type { Table } from "../engine/types";
import type { ZipFormat } from "../engine/zip";
import type { EngineRequest, EngineResponse, ParseLimits, ParseResponse, RunResponse, WorkerEnvelope, WorkerReply } from "./protocol";

/** Requests taking longer than this are stopped (the worker is terminated and replaced). Users can also press Cancel. */
const TIMEOUT_MS = 180_000;

/** Rejection reason when the user pressed Cancel. */
export const CANCELLED = "Cancelled.";
export function isCancelled(e: unknown): boolean {
  return e instanceof Error && e.message === CANCELLED;
}

type Pending = { resolve: (v: EngineResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export interface EngineClient {
  /** "worker" when processing runs off the main thread, "inline" when Web Workers are unavailable. */
  readonly mode: "worker" | "inline";
  parse(name: string, bytes: Uint8Array, options?: ParseFileOptions, limits?: ParseLimits): Promise<ParseResponse>;
  run(inputs: { name: string; table: Table }[], merge: MergeOptions | null, steps: Step[]): Promise<RunResponse>;
  csv(table: Table, options: CsvExportOptions): Promise<string>;
  xlsx(sheets: { name: string; table: Table }[]): Promise<Uint8Array>;
  zip(files: { name: string; table: Table }[], format: ZipFormat, csv: CsvExportOptions): Promise<Uint8Array>;
  /** Stops whatever the worker is doing (terminates and restarts it); pending calls reject with CANCELLED. */
  cancel(): void;
  dispose(): void;
}

export function createEngineClient(): EngineClient {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let mode: "worker" | "inline" = "inline";

  const failAll = (msg: string) => {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(msg));
      pending.delete(id);
    }
  };

  const start = () => {
    if (typeof Worker === "undefined") return;
    try {
      worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
      mode = "worker";
      worker.onmessage = (e: MessageEvent<WorkerReply>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.value);
        else p.reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        e.preventDefault?.();
        failAll("The processing worker crashed. Try again; if it keeps happening, the file may be too large for this browser.");
        worker?.terminate();
        worker = null;
        mode = "inline";
      };
    } catch {
      worker = null;
      mode = "inline";
    }
  };
  start();

  const send = (request: EngineRequest): Promise<EngineResponse> => {
    if (!worker) {
      // Main-thread fallback with the exact same code path.
      return import("./protocol").then(({ handleRequest }) => handleRequest(request));
    }
    const id = nextId++;
    return new Promise<EngineResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Processing took longer than three minutes and was stopped. A find & replace pattern may be too slow, or the file too large."));
        worker?.terminate();
        worker = null;
        failAll("Processing was restarted.");
        start();
      }, TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      const envelope: WorkerEnvelope = { id, request };
      worker!.postMessage(envelope);
    });
  };

  return {
    get mode() {
      return mode;
    },
    parse: (name, bytes, options = {}, limits) => send({ kind: "parse", name, bytes, options, limits }) as Promise<ParseResponse>,
    run: (inputs, merge, steps) => send({ kind: "run", inputs, merge, steps }) as Promise<RunResponse>,
    csv: (table, options) => send({ kind: "csv", table, options }) as Promise<string>,
    xlsx: (sheets) => send({ kind: "xlsx", sheets }) as Promise<Uint8Array>,
    zip: (files, format, csv) => send({ kind: "zip", files, format, csv }) as Promise<Uint8Array>,
    cancel: () => {
      if (!worker) return; // inline mode runs synchronously; there is nothing in flight to stop
      worker.terminate();
      worker = null;
      failAll(CANCELLED);
      start();
    },
    dispose: () => {
      failAll("Closed.");
      worker?.terminate();
      worker = null;
    },
  };
}
