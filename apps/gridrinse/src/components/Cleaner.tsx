"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataGrid } from "@/components/DataGrid";
import { DownloadPaywall, PassActiveNote } from "@/components/PassPaywall";
import { RinseMeter } from "@/components/RinseMeter";
import { StepCard } from "@/components/StepEditor";
import { UpgradeNotice } from "@/components/UpgradeNotice";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { track } from "@/lib/analytics";
import { hasCarryOver, saveCarryOver, sweepCarryOver, takeCarryOver, type CarryMeta } from "@/lib/carryOver";
import { CLEANER_EVENTS, type CleanerStage } from "@/lib/cleaner-events";
import { baseName, downloadBlob, MIME } from "@/lib/download";
import { checkDownload, countsTowardsDaily, downloadsToday, recordDownload, type DownloadBlock } from "@/lib/downloadQuota";
import { normalizeHeaders } from "@/lib/engine/ops/basic";
import type { CsvExportOptions } from "@/lib/engine/export";
import type { DateNeedsChoice } from "@/lib/engine/ops/dates";
import type { XlsxDateMode } from "@/lib/engine/parse";
import { detectKind, zipFileName } from "@/lib/engine/names";
import { isCellChanged } from "@/lib/engine/pipeline";
import type { Step, StepType } from "@/lib/engine/schema";
import { formatBytes, nextOffer, passFits, processingLimits, type ClientEntitlements, type PassOffer, type ProcessingLimits, type UpgradeOffer } from "@/lib/limits";
import { formatPassTime } from "@/lib/passCheckout";
import { checkBeforeParse, estimateCellsMemory, estimateFileMemory, maxCellsFor, memoryBudget } from "@/lib/memory";
import { SAMPLE_CSV, SAMPLE_FILE_NAME } from "@/lib/sample";
import { defaultSteps, renameRefs, STEP_META, templateFor, withToolSteps } from "@/lib/steps";
import { fetchEntitlements, useEntitlements } from "@/lib/useEntitlements";
import { createEngineClient, isCancelled, type EngineClient } from "@/lib/worker/client";
import type { ParseResponse, RunResponse } from "@/lib/worker/protocol";

interface LoadedFile {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  parse: ParseResponse;
  sheet?: string;
  dateMode: XlsxDateMode;
  hasHeader: boolean;
}

type Mode = "merge" | "batch";
type View = "cleaned" | "original" | "removed";

interface MergeState {
  looseMatch: boolean;
  addSource: boolean;
  sourceName: string;
  /** fileId -> (source column -> target column, "" = leave out) */
  mappings: Record<string, Record<string, string>>;
}

const ADDABLE: StepType[] = ["findReplace", "dedupe", "formatNumbers", "renameColumns", "reorderColumns", "dropColumns", "mergeColumns", "splitColumn", "trim", "formatDates"];

let fileCounter = 0;

/** Map suggested column names through the default header tidy-up so default steps point at the right columns. */
function tidyNames(columns: string[], names: string[]): string[] {
  const tidy = normalizeHeaders({ columns, rows: [] }, { style: "keep" }).table.columns;
  return names.map((n) => tidy[columns.indexOf(n)] ?? n);
}

/** Rough heap estimate of a loaded file (parsed table + kept bytes), for the memory guard. */
function fileMemory(f: LoadedFile): number {
  return f.size + estimateCellsMemory(f.parse.table.rows.length * Math.max(1, f.parse.table.columns.length));
}

const MODE_OF = (files: number, mode: Mode) => (files <= 1 ? "single" : mode);

export interface CleanerProps {
  /** Free plan limits from the catalog (server-rendered), used until /api/me/entitlements answers. */
  freeLimits: ProcessingLimits;
  /** Injected in tests; defaults to GET /api/me/entitlements. */
  loadEntitlements?: () => Promise<ClientEntitlements | null>;
  /** Paid plans as the upgrade prompts may describe them (server-computed from the catalog). */
  offers?: UpgradeOffer[];
  /** The one-time pass the paywall offers (server-computed from the catalog); none = plans only. */
  pass?: PassOffer | null;
  /** A tool page's own sample (one or more files) and steps; defaults to the general messy orders export. */
  sample?: { files: { name: string; csv: string }[]; steps?: Step[] };
  /** "hidden": no empty-state drop card (the homepage hero is the drop zone and drives this component by event). */
  emptyState?: "full" | "hidden";
}

type RejectReason = "too_big" | "too_many_files" | "too_many_rows" | "unsupported" | "memory" | "unreadable";

interface LimitHit {
  /** What a paid plan would need to handle, for choosing which plan to offer. */
  need: { fileBytes?: number; files?: number };
  kind: "size" | "rows" | "files";
}

/** A file to load: one chosen/dropped by the visitor, or bytes already in this browser (sample, restored work). */
type AddItem = File | { name: string; bytes: Uint8Array; parseOpts?: { sheet?: string; dateMode: XlsxDateMode; hasHeader: boolean } };

type PassStatus = "active" | "unpaid" | "canceled" | "expired" | "revoked" | "invalid" | "error";
const PASS_STATUSES: readonly string[] = ["active", "unpaid", "canceled", "expired", "revoked", "invalid", "error"];

export function Cleaner({ freeLimits, loadEntitlements = fetchEntitlements, offers = [], pass = null, sample, emptyState = "full" }: CleanerProps) {
  const clientRef = useRef<EngineClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= createEngineClient()), []);
  useEffect(() => () => clientRef.current?.dispose(), []);

  // Plan limits for LOCAL processing come from the server's entitlements. They are value fences, not
  // security boundaries: the file never leaves this browser, so there is nothing server-side to protect.
  const { entitlements, loaded: entitlementsLoaded, refresh: refreshEntitlements } = useEntitlements(loadEntitlements);
  const limits: ProcessingLimits = entitlements ? processingLimits(entitlements.planId, entitlements.planName, entitlements.limits) : freeLimits;
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runNonce, setRunNonce] = useState(0);
  const cancelled = useRef(false);

  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [steps, setSteps] = useState<Step[]>(() => defaultSteps([]));
  const [merge, setMerge] = useState<MergeState>({ looseMatch: true, addSource: true, sourceName: "source_file", mappings: {} });
  const [single, setSingle] = useState<RunResponse | null>(null);
  const [batch, setBatch] = useState<{ fileId: string; res: RunResponse }[]>([]);
  const [pending, setPending] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [view, setView] = useState<View>("cleaned");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [csvOpts, setCsvOpts] = useState<Required<CsvExportOptions>>({ delimiter: ",", bom: true, lineEnding: "crlf", guardFormulas: false });
  const [dragOver, setDragOver] = useState(false);
  const [addType, setAddType] = useState<StepType>("findReplace");
  const fileInput = useRef<HTMLInputElement>(null);
  const token = useRef(0);

  const isBatch = files.length > 1 && mode === "batch";
  const isMerge = files.length > 1 && mode === "merge";

  // Run the pipeline whenever the inputs or steps change. Results from older runs are discarded.
  useEffect(() => {
    if (files.length === 0) {
      setSingle(null);
      setBatch([]);
      setPending(false);
      return;
    }
    const my = ++token.current;
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        setStatus("Cleaning…");
        if (isBatch) {
          const out: { fileId: string; res: RunResponse }[] = [];
          for (const f of files) {
            const res = await client().run([{ name: f.name, table: f.parse.table }], null, steps);
            if (my !== token.current) return;
            out.push({ fileId: f.id, res });
          }
          setBatch(out);
          setSingle(null);
          const before = out.reduce((n, o) => n + o.res.input.rows.length, 0);
          const after = out.reduce((n, o) => n + o.res.result.table.rows.length, 0);
          setStatus(`Cleaned ${out.length} files: ${before.toLocaleString("en-US")} rows in, ${after.toLocaleString("en-US")} rows out.`);
        } else {
          const inputs = (isMerge ? files : files.filter((f) => f.id === activeId).concat(files).slice(0, 1)).map((f) => ({ name: f.name, table: f.parse.table }));
          const mergeOpts = isMerge
            ? { looseMatch: merge.looseMatch, sourceColumn: merge.addSource ? merge.sourceName || "source_file" : null, mappings: files.map((f) => merge.mappings[f.id]) }
            : null;
          const res = await client().run(inputs, mergeOpts, steps);
          if (my !== token.current) return;
          setSingle(res);
          setBatch([]);
          const r = res.result;
          setStatus(
            `Cleaned: ${res.input.rows.length.toLocaleString("en-US")} rows in, ${r.table.rows.length.toLocaleString("en-US")} rows out, ${r.changedCount.toLocaleString("en-US")} cells changed.`,
          );
        }
        setRunError(null);
        setPending(false);
      } catch (e) {
        if (my !== token.current) return;
        if (isCancelled(e)) {
          setRunError("Cleaning was cancelled. Change a step or press “Run again”.");
          setStatus("Cancelled.");
        } else {
          setRunError(e instanceof Error ? e.message : String(e));
          setStatus("Cleaning failed.");
        }
        setPending(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [files, steps, merge, isBatch, isMerge, activeId, client, runNonce]);

  const cancelWork = () => {
    cancelled.current = true;
    token.current++;
    client().cancel();
    if (pending) setRunError("Cleaning was cancelled. Change a step or press “Run again”.");
    setPending(false);
    setLoading(false);
    setStatus("Cancelled.");
  };

  const shown: RunResponse | null = isBatch ? (batch.find((b) => b.fileId === activeId)?.res ?? batch[0]?.res ?? null) : single;
  const activeFile = files.find((f) => f.id === activeId) ?? files[0] ?? null;
  const inputColumns = shown?.input.columns ?? activeFile?.parse.table.columns ?? [];

  const activePass = entitlements?.pass ?? null;
  const planWord = activePass && limits.planId === "free" ? `the ${activePass.name}` : `your plan (${limits.planName})`;
  const [limitHit, setLimitHit] = useState<LimitHit | null>(null);
  const [source, setSource] = useState<"sample" | "file">("file");

  const addFiles = async (list: AddItem[], opts: { source?: "sample" | "file"; toolSteps?: Step[]; restore?: CarryMeta } = {}) => {
    const errors: string[] = [];
    const warns: string[] = [];
    const rejected: RejectReason[] = [];
    let hit: LimitHit | null = null;
    const room = limits.maxFiles - files.length;
    if (list.length > room) {
      errors.push(`${planWord} handles ${limits.maxFiles} files at once; ${list.length - Math.max(room, 0)} file(s) were not added.`);
      hit = { kind: "files", need: { files: files.length + list.length } };
      rejected.push("too_many_files");
    }
    const take = list.slice(0, Math.max(room, 0));
    cancelled.current = false;
    setLoading(true);
    setStatus("Reading file…");
    const added: LoadedFile[] = [];
    const budget = memoryBudget();
    for (const item of take) {
      if (cancelled.current) {
        errors.push("Loading was cancelled.");
        break;
      }
      const name = item.name;
      const size = item instanceof File ? item.size : item.bytes.byteLength;
      const kind = detectKind(name);
      if (kind === "unsupported") {
        errors.push(`${name}: not a CSV or Excel file (.csv, .tsv, .txt, .xlsx, .xls, .ods).`);
        rejected.push("unsupported");
        continue;
      }
      if (size > limits.maxFileBytes) {
        errors.push(`${name} is ${formatBytes(size)}; ${planWord} handles files up to ${formatBytes(limits.maxFileBytes)}.`);
        hit = { kind: "size", need: { fileBytes: Math.max(size, hit?.need.fileBytes ?? 0), files: hit?.need.files } };
        rejected.push("too_big");
        continue;
      }
      // Memory guard BEFORE reading: refuse or warn instead of letting the tab crash.
      const loaded = [...files, ...added];
      const inUse = loaded.reduce((n, f) => n + fileMemory(f), 0);
      const verdict = checkBeforeParse({
        name,
        bytes: size,
        kind: kind === "workbook" ? "xlsx" : "csv",
        inUseBytes: inUse,
        loadedFileBytes: loaded.reduce((n, f) => n + f.size, 0),
        budget,
      });
      if (verdict.level === "refuse") {
        errors.push(verdict.message);
        rejected.push("memory");
        continue;
      }
      if (verdict.level === "warn") warns.push(verdict.message);
      try {
        const bytes = item instanceof File ? new Uint8Array(await item.arrayBuffer()) : item.bytes;
        const loadedCells = loaded.reduce((n, f) => n + f.parse.table.rows.length * Math.max(1, f.parse.table.columns.length), 0);
        const parseOpts = item instanceof File ? undefined : item.parseOpts;
        const parse = await client().parse(name, bytes, parseOpts ?? {}, {
          maxRows: limits.maxRows,
          maxCells: maxCellsFor(budget, inUse + estimateFileMemory(size, kind === "workbook" ? "xlsx" : "csv") / 4, loadedCells),
          planName: limits.planName,
        });
        added.push({ id: `f${++fileCounter}`, name, size, bytes, parse, sheet: parse.sheet, dateMode: parseOpts?.dateMode ?? "display", hasHeader: parseOpts?.hasHeader ?? true });
      } catch (e) {
        if (isCancelled(e)) {
          errors.push("Loading was cancelled.");
          break;
        }
        const msg = e instanceof Error ? e.message : "could not be read";
        if (/your plan/.test(msg)) {
          hit ??= { kind: "rows", need: {} };
          rejected.push("too_many_rows");
        } else rejected.push("unreadable");
        errors.push(msg.startsWith(name) ? msg : `${name}: ${msg}`);
      }
    }
    setLoading(false);
    setLoadErrors(errors);
    setWarnings(warns);
    setLimitHit(hit);
    for (const reason of new Set(rejected)) {
      track("file_rejected", { reason });
      if (hit && (reason === "too_big" || reason === "too_many_files" || reason === "too_many_rows")) track("paywall_shown", { reason });
    }
    if (added.length === 0) {
      setStatus(errors.length ? "No file was added." : "");
      return;
    }
    const src = opts.source ?? "file";
    track("tool_used", { action: "clean", mode: MODE_OF(files.length + added.length, mode), files: files.length + added.length, steps: steps.length, source: src });
    if (files.length === 0) {
      const first = added[0]!;
      // Work kept across a pass checkout: the visitor's own steps (and settings) instead of the defaults.
      const restore = opts.restore ?? (src === "file" ? keptSteps.current : null);
      keptSteps.current = null;
      if (restore) {
        setSteps(restore.steps);
        setMode(restore.mode);
        setMerge({ ...restore.merge, mappings: {} });
        setCsvOpts(restore.csvOpts);
      } else setSteps(withToolSteps(defaultSteps(tidyNames(first.parse.table.columns, first.parse.suggestions.numberColumns)), opts.toolSteps));
      setActiveId((opts.restore ? added[opts.restore.activeIndex]?.id : undefined) ?? first.id);
      setView("cleaned");
      setSource(src);
      // Arriving from the hero (or a drop anywhere on the page): bring the results into view.
      setTimeout(() => {
        const el = document.getElementById("start");
        const top = el?.getBoundingClientRect().top;
        if (el && top !== undefined && (top < -40 || top > window.innerHeight * 0.5)) el.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, 60);
    } else if (src === "file") setSource("file");
    setFiles((prev) => [...prev, ...added]);
    setStatus(`Loaded ${added.map((a) => a.name).join(", ")}.`);
  };

  const loadSample = () => {
    if (files.length > 0) return;
    const list = sample?.files.length ? sample.files : [{ name: SAMPLE_FILE_NAME, csv: SAMPLE_CSV }];
    void addFiles(
      list.map((f) => ({ name: f.name, bytes: new TextEncoder().encode(f.csv) })),
      { source: "sample", toolSteps: sample?.steps },
    );
  };

  // The homepage hero's buttons ("Clean my spreadsheet", "Try a sample file") drive this component by event.
  const choose = () => (fileInput.current ? fileInput.current.click() : document.getElementById("start")?.scrollIntoView({ behavior: "smooth" }));
  const addDropped = (list: File[]) => void addFiles(list);
  const heroActions = useRef({ sample: loadSample, choose, add: addDropped });
  heroActions.current = { sample: loadSample, choose, add: addDropped };
  useEffect(() => {
    const sample = () => heroActions.current.sample();
    const choose = () => heroActions.current.choose();
    const add = (e: Event) => {
      const list = (e as CustomEvent<File[]>).detail;
      if (Array.isArray(list) && list.length) heroActions.current.add(list);
    };
    // A file dropped anywhere on the page goes into the cleaner (instead of the browser opening it).
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
      e.preventDefault();
      heroActions.current.add(Array.from(e.dataTransfer.files));
    };
    window.addEventListener(CLEANER_EVENTS.sample, sample);
    window.addEventListener(CLEANER_EVENTS.choose, choose);
    window.addEventListener(CLEANER_EVENTS.files, add);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener(CLEANER_EVENTS.sample, sample);
      window.removeEventListener(CLEANER_EVENTS.choose, choose);
      window.removeEventListener(CLEANER_EVENTS.files, add);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  // Links elsewhere ("Try a sample" on the Features page) arrive with ?sample=1.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("sample") !== "1") return;
    url.searchParams.delete("sample");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    heroActions.current.sample();
  }, []);

  // Back from a pass checkout (?pass=<status> from the claim route or Stripe's cancel URL): a short message, and
  // the work kept in this browser before leaving (steps, settings and, when IndexedDB allowed it, the files).
  const [passStatus, setPassStatus] = useState<PassStatus | null>(null);
  const [restored, setRestored] = useState<"files" | "steps" | null>(null);
  const keptSteps = useRef<CarryMeta | null>(null);
  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  useEffect(() => {
    const url = new URL(window.location.href);
    const st = url.searchParams.get("pass");
    if (st !== null) {
      url.searchParams.delete("pass");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      if (PASS_STATUSES.includes(st)) {
        setPassStatus(st as PassStatus);
        if (st === "active") track("pass_activated", { pass: "day" });
      }
    }
    if (!hasCarryOver()) {
      void sweepCarryOver();
      return;
    }
    void (async () => {
      const kept = await takeCarryOver();
      if (!kept) return;
      if (kept.files?.length) {
        await addFilesRef.current(
          kept.files.map((f) => ({ name: f.name, bytes: f.bytes, parseOpts: { sheet: f.sheet, dateMode: f.dateMode, hasHeader: f.hasHeader } })),
          { source: "file", restore: kept.meta },
        );
        setRestored("files");
      } else if (kept.meta.fileCount > 0) {
        keptSteps.current = kept.meta;
        setRestored("steps");
      }
    })();
  }, []);

  /** Keeps the current work in this browser before leaving for checkout (nothing is uploaded). */
  const keepWork = async () => {
    if (files.length === 0) return;
    await saveCarryOver(
      {
        steps,
        mode,
        merge: { looseMatch: merge.looseMatch, addSource: merge.addSource, sourceName: merge.sourceName },
        csvOpts,
        activeIndex: Math.max(0, files.findIndex((f) => f.id === activeFile?.id)),
      },
      files.map((f) => ({ name: f.name, bytes: f.bytes, sheet: f.sheet, dateMode: f.dateMode, hasHeader: f.hasHeader })),
    );
  };

  // Progress for the "Choose file → Review changes → Download" steps on the How it works page.
  const [downloaded, setDownloaded] = useState(false);
  const stage: CleanerStage = files.length === 0 ? 1 : downloaded ? 3 : 2;
  useEffect(() => {
    if (files.length === 0) setDownloaded(false);
  }, [files.length]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent<CleanerStage>(CLEANER_EVENTS.stage, { detail: stage }));
  }, [stage]);

  const reparse = async (id: string, patch: Partial<Pick<LoadedFile, "sheet" | "dateMode" | "hasHeader">>) => {
    const f = files.find((x) => x.id === id);
    if (!f) return;
    const next = { ...f, ...patch };
    try {
      const others = files.filter((x) => x.id !== id);
      const inUse = others.reduce((n, x) => n + fileMemory(x), 0);
      const loadedCells = others.reduce((n, x) => n + x.parse.table.rows.length * Math.max(1, x.parse.table.columns.length), 0);
      const parse = await client().parse(
        f.name,
        f.bytes,
        { sheet: next.sheet, dateMode: next.dateMode, hasHeader: next.hasHeader },
        { maxRows: limits.maxRows, maxCells: maxCellsFor(memoryBudget(), inUse, loadedCells), planName: limits.planName },
      );
      setFiles((prev) => prev.map((x) => (x.id === id ? { ...next, parse } : x)));
    } catch (e) {
      if (!isCancelled(e)) setLoadErrors([e instanceof Error ? e.message : String(e)]);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (activeId === id) setActiveId(files.find((f) => f.id !== id)?.id ?? null);
  };

  const startOver = () => {
    setPaywall(null);
    keptSteps.current = null;
    setRestored(null);
    setFiles([]);
    setActiveId(null);
    setSteps(defaultSteps([]));
    setLoadErrors([]);
    setStatus("Cleared. Nothing was kept.");
  };

  const resetSteps = () => {
    const f = files[0];
    setSteps(defaultSteps(f ? tidyNames(f.parse.table.columns, f.parse.suggestions.numberColumns) : []));
    setView("original");
    setStatus("Steps reset to the defaults. Showing the original file.");
  };

  const columnsBefore = (i: number): string[] => (i === 0 ? inputColumns : (shown?.result.steps[i - 1]?.columnsAfter ?? inputColumns));

  const updateStep = (i: number, next: Step) => {
    setSteps((prev) => {
      const old = prev[i]!;
      let out = prev.map((s, j) => (j === i ? next : s));
      // When header style changes, keep later steps pointing at the same columns under their new names.
      if (old.type === "normalizeHeaders" && next.type === "normalizeHeaders" && old.style !== next.style) {
        const cols = columnsBefore(i);
        const a = normalizeHeaders({ columns: cols, rows: [] }, { style: old.style }).table.columns;
        const b = normalizeHeaders({ columns: cols, rows: [] }, { style: next.style }).table.columns;
        const map: Record<string, string> = {};
        a.forEach((name, k) => {
          if (name !== b[k]) map[name] = b[k]!;
        });
        out = out.map((s, j) => (j > i ? renameRefs(s, map) : s));
      }
      return out;
    });
  };

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const reorderStep = (from: number, to: number) =>
    setSteps((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const copy = prev.slice();
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved!);
      return copy;
    });
  const moveStep = (i: number, d: -1 | 1) =>
    setSteps((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const copy = prev.slice();
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const addStep = () => setSteps((prev) => [...prev, templateFor(addType, columnsBefore(prev.length))]);

  // ---- derived views ----
  const result = shown?.result ?? null;
  const input = shown?.input ?? null;
  const changedRows = useMemo(() => {
    if (!result) return [];
    const w = result.table.columns.length;
    const out: number[] = [];
    for (let r = 0; r < result.table.rows.length; r++) {
      for (let c = 0; c < w; c++) {
        if (result.changedFlags[r * w + c]) {
          out.push(r);
          break;
        }
      }
    }
    return out;
  }, [result]);
  const originalMarks = useMemo(() => {
    if (!result || !input) return new Set<number>();
    const marks = new Set<number>();
    const w = result.table.columns.length;
    const iw = input.columns.length;
    for (let r = 0; r < result.table.rows.length; r++) {
      for (let c = 0; c < w; c++) {
        const oc = result.columnOrigins[c];
        if (result.changedFlags[r * w + c] && oc !== null && oc !== undefined) marks.add(result.rowOrigins[r]! * iw + oc);
      }
    }
    return marks;
  }, [result, input]);
  const removedByStep = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of result?.removed ?? []) m.set(STEP_META[r.stepType].label, (m.get(STEP_META[r.stepType].label) ?? 0) + 1);
    return [...m.entries()];
  }, [result]);

  const ready = !!result && !pending && !runError;

  // Upgrade prompts: only where a paid plan really helps, with that plan's real numbers.
  const signedIn = !!entitlements?.signedIn;
  const limitOffer = limitHit && limits.planId !== "business" ? nextOffer(offers, limits, limitHit.need) : null;
  // The pass is offered first only where it would really take the file and beats what the visitor has now.
  const passBeats = !!pass && (pass.maxFileBytes > limits.maxFileBytes || pass.maxRows > limits.maxRows || pass.maxFiles > limits.maxFiles);
  const limitPass = limitHit && passBeats && passFits(pass, limitHit.need) ? pass : null;
  const proOffer = offers.find((o) => o.planId === "pro") ?? offers[0] ?? null;
  const filesOffer = !limitHit && files.length >= limits.maxFiles ? nextOffer(offers, limits, { files: limits.maxFiles + 1 }) : null;
  const repeatOffer = downloaded && source === "file" && limits.planId === "free" ? nextOffer(offers, limits) : null;

  // Date columns the "Standardize dates" step left alone because the order is ambiguous: asked above the table.
  const dateIdx = steps.findIndex((s) => s.type === "formatDates" && s.enabled);
  const dateRun = dateIdx >= 0 && !pending && shown?.result.steps[dateIdx]?.step.id === steps[dateIdx]!.id ? shown?.result.steps[dateIdx] : undefined;
  const dateChoices = (dateRun?.report.details?.needsChoice as DateNeedsChoice[] | undefined) ?? [];
  const outName = isMerge ? "merged" : baseName(activeFile?.name ?? "data");

  // The download paywall: free downloads are up to `downloadRows` rows, `downloadsPerDay` a day, counted in this
  // browser (see lib/downloadQuota.ts: a value fence, the file never leaves this device). The sample is always free.
  const [paywall, setPaywall] = useState<{ rows: number; reason: DownloadBlock } | null>(null);
  const isSample = source === "sample";
  const mayDownload = async (rows: number): Promise<boolean> => {
    // Until the entitlements answer, ask once more so a pass holder is never stopped by the free defaults.
    const ent = entitlementsLoaded ? entitlements : await refreshEntitlements();
    const l = ent ? processingLimits(ent.planId, ent.planName, ent.limits) : freeLimits;
    const v = checkDownload({ rows, limits: l, usedToday: downloadsToday(), sample: isSample });
    if (v.ok) return true;
    setPaywall({ rows, reason: v.reason });
    track("paywall_shown", { reason: v.reason });
    return false;
  };

  const usage = (action: "download_csv" | "download_xlsx" | "download_zip" | "download_batch_xlsx", format: "csv" | "tsv" | "xlsx" | "zip_csv" | "zip_xlsx") => {
    if (countsTowardsDaily(limits, isSample)) recordDownload();
    setPaywall(null);
    setDownloaded(true);
    track("tool_used", { action, mode: MODE_OF(files.length, mode), files: files.length, steps: steps.length, format });
  };

  const [exporting, setExporting] = useState(false);
  const exportGuard = async (fn: () => Promise<void>) => {
    setExporting(true);
    try {
      await fn();
    } catch (e) {
      if (!isCancelled(e)) setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const downloadCsv = () =>
    exportGuard(async () => {
      if (!result) return;
      if (!(await mayDownload(result.table.rows.length))) return;
      const text = await client().csv(result.table, csvOpts);
      const tsv = csvOpts.delimiter === "\t";
      downloadBlob(text, `${outName}-clean.${tsv ? "tsv" : "csv"}`, MIME.csv);
      usage("download_csv", tsv ? "tsv" : "csv");
    });
  const downloadXlsx = () =>
    exportGuard(async () => {
      if (!result) return;
      if (!(await mayDownload(result.table.rows.length))) return;
      const bytes = await client().xlsx([{ name: outName, table: result.table }]);
      downloadBlob(bytes as BlobPart, `${outName}-clean.xlsx`, MIME.xlsx);
      usage("download_xlsx", "xlsx");
    });
  const downloadOriginal = (f: LoadedFile) => downloadBlob(f.bytes as BlobPart, f.name, "application/octet-stream");
  const batchTables = () => batch.map((b) => ({ name: files.find((f) => f.id === b.fileId)?.name ?? "data", table: b.res.result.table }));
  const batchRows = () => batch.reduce((n, b) => n + b.res.result.table.rows.length, 0);
  const downloadBatchXlsx = () =>
    exportGuard(async () => {
      if (!(await mayDownload(batchRows()))) return;
      const bytes = await client().xlsx(batchTables());
      downloadBlob(bytes as BlobPart, "batch-clean.xlsx", MIME.xlsx);
      usage("download_batch_xlsx", "xlsx");
    });
  /** One ZIP with a cleaned CSV (or XLSX) per file, built in the worker. Nothing is uploaded. */
  const downloadZip = (format: "csv" | "xlsx") =>
    exportGuard(async () => {
      if (!(await mayDownload(batchRows()))) return;
      setStatus("Building ZIP…");
      const bytes = await client().zip(batchTables(), format, csvOpts);
      downloadBlob(bytes as BlobPart, zipFileName(), MIME.zip);
      setStatus(`ZIP ready: ${batch.length} files.`);
      usage("download_zip", format === "xlsx" ? "zip_xlsx" : "zip_csv");
    });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const list = Array.from(e.dataTransfer.files);
    if (list.length) void addFiles(list);
  };

  const fileInputEl = (
    <input
      ref={fileInput}
      id="file-input"
      type="file"
      multiple
      accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
      className="sr-only"
      tabIndex={-1}
      aria-label="Choose CSV or Excel files"
      onChange={(e) => {
        const list = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (list.length) void addFiles(list);
      }}
    />
  );
  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop,
  };

  const dropZone =
    files.length === 0 ? (
      <div>
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="card-pop flex flex-col p-5 sm:p-7">
            <h2 className="display text-[1.9rem] sm:text-[2.5rem]">Start with a CSV or Excel file</h2>
            <div
              {...dragProps}
              className={`mt-5 flex flex-1 flex-col items-center justify-center rounded-xl border-[3px] border-dashed border-ink px-4 py-8 text-center transition-colors ${dragOver ? "bg-mint" : "bg-mint-soft"}`}
            >
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
                <path d="M14 2.5V8h5.5M12 17.5v-6M9.2 14.2 12 11.4l2.8 2.8" />
              </svg>
              <p className="display mt-3 text-[1.8rem] sm:text-[2.2rem]">Drop your file here</p>
              <p className="mt-1 text-[17px] font-medium">or choose a file from your device</p>
              <button type="button" className="btn-pop mt-5 min-w-[14rem]" onClick={() => fileInput.current?.click()} disabled={loading}>
                Choose a file
              </button>
              <p className="mt-4 text-[15px] font-medium text-ink-2">
                .CSV and .XLSX · Up to {formatBytes(limits.maxFileBytes).replace(/\.0 /, " ")} · {limits.maxRows.toLocaleString("en-US")} rows per file
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-ink pt-4">
              <p className="text-[18px] font-extrabold">Just looking around?</p>
              <button type="button" className="inline-flex items-center gap-2 text-[17px] font-extrabold underline decoration-2 underline-offset-4" onClick={loadSample} disabled={loading}>
                Try a sample file
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12h15M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            {fileInputEl}
          </div>

          <div className="card-pop p-5 sm:p-7">
            <h2 className="text-[1.6rem] font-extrabold tracking-[-0.02em] sm:text-[1.9rem]">A fresh start for your data</h2>
            <ul className="mt-4 space-y-3 text-[17px] font-medium">
              {["Trim extra spaces", "Remove blank and duplicate rows", "Standardize dates and numbers", "Preview every change"].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-mint-soft" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m4.5 12.5 5 5 10-11" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center gap-4 rounded-xl bg-lemon-soft p-4">
              <svg className="shrink-0" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
                <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
                <path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01M16.5 17h.01" strokeWidth="2.6" />
              </svg>
              <p>
                <strong className="block text-[18px] font-extrabold">Unclear dates?</strong>
                <span className="text-[15px] font-medium">We&apos;ll flag them for your review.</span>
              </p>
            </div>
            <div className="mt-4 flex items-center gap-4 p-1">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-mint-soft" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2" strokeLinejoin="round">
                  <path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z" />
                </svg>
              </span>
              <p>
                <strong className="block text-[18px] font-extrabold">Your file stays on your device.</strong>
                <span className="text-[15px] font-medium">Processed in your browser. Never uploaded.</span>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 flex items-center gap-2.5 text-[16px] font-medium">
          <svg className="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z" />
          </svg>
          {limits.planName} plan: up to {limits.maxFiles} files at once.{limits.planName === "Free" ? " No account required." : ""}
        </p>
        <div className="mt-5 flex flex-col gap-2 rounded-[10px] border-2 border-ink bg-surface px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
          <p className="text-[18px] font-extrabold sm:border-r-2 sm:border-rule sm:pr-6">What happens after I choose a file?</p>
          <p className="text-[16px] font-medium text-ink-2">You&apos;ll review the proposed cleanup before downloading your updated file.</p>
        </div>
      </div>
    ) : (
      <div {...dragProps} className={`ruled relative border px-4 py-4 ${dragOver ? "border-accent" : "border-rule-strong"}`}>
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-3 bg-surface/95 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={loading || files.length >= limits.maxFiles}>
              Add another file…
            </button>
          </div>
          {fileInputEl}
        </div>
      </div>
    );

  return (
    <div id="start" className="mx-auto max-w-[1400px] scroll-mt-4 px-4 pb-16 sm:px-8">
      <p className="sr-only" aria-live="polite" role="status">
        {status}
      </p>

      {(passStatus || restored) && (
        <div role="status" className="mb-3 rounded-lg border-2 border-ink bg-mint-soft px-4 py-3 text-[15px] font-medium">
          {passStatus === "active" && (
            <p className="font-extrabold">
              {activePass ? `Pass active until ${formatPassTime(activePass.expiresAt)}.` : "Payment received. Your pass is active."} Downloads are unlocked in this browser.
            </p>
          )}
          {passStatus === "unpaid" && <p className="font-extrabold">Payment is still processing — this page unlocks when it clears.</p>}
          {passStatus === "canceled" && <p>Checkout canceled. Nothing was charged.</p>}
          {passStatus === "expired" && <p>That pass has ended. A new one starts from the moment you buy it.</p>}
          {passStatus === "revoked" && <p>That pass was refunded, so it no longer unlocks anything.</p>}
          {(passStatus === "invalid" || passStatus === "error") && (
            <p>
              We could not confirm that pass. If you paid, <Link href="/support" className="font-bold underline">contact support</Link> and a person will sort it out.
            </p>
          )}
          {restored === "files" && <p>Your file and cleaning steps are back, restored from this browser. Nothing was uploaded.</p>}
          {restored === "steps" && <p>Your cleaning steps are kept. Drop the file again to download.</p>}
        </div>
      )}

      {files.length === 0 && (emptyState === "full" ? dropZone : fileInputEl)}

      {(loading || pending || exporting) && (
        <div className="mt-3 flex items-center justify-between gap-3 border border-rule bg-surface px-3 py-2 text-sm">
          <span aria-hidden="true">{loading ? "Reading file in your browser…" : exporting ? "Preparing download…" : "Cleaning in your browser…"}</span>
          <button type="button" className="btn btn-sm" onClick={cancelWork}>
            Cancel
          </button>
        </div>
      )}

      {loadErrors.length > 0 && (
        <div role="alert" className="mt-3 border-l-2 border-del-ink bg-del px-3 py-2 text-sm text-del-ink">
          {loadErrors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {limitOffer && limitHit && (
        <div className="mt-3">
          <UpgradeNotice
            offer={limitOffer}
            from={limitHit.kind === "files" ? "files" : "limit"}
            signedIn={signedIn}
            pass={limitPass}
            beforeCheckout={keepWork}
            title={
              limitPass
                ? limitHit.kind === "files"
                  ? `Clean up to ${limitPass.maxFiles} files at once with a ${limitPass.name} or ${limitOffer.planName}`
                  : limitHit.kind === "size"
                    ? `Open files up to ${formatBytes(limitPass.maxFileBytes).replace(/\.0 /, " ")} with a ${limitPass.name} or ${limitOffer.planName}`
                    : `Read up to ${limitPass.maxRows.toLocaleString("en-US")} rows per file with a ${limitPass.name} or ${limitOffer.planName}`
                : limitHit.kind === "files"
                ? `${limitOffer.planName} cleans up to ${limitOffer.maxFiles} files at once`
                : limitHit.kind === "size"
                  ? `${limitOffer.planName} opens files up to ${formatBytes(limitOffer.maxFileBytes).replace(/\.0 /, " ")}`
                  : `${limitOffer.planName} reads up to ${limitOffer.maxRows.toLocaleString("en-US")} rows per file`
            }
            body={`The ${limits.planName} plan stops at ${limitHit.kind === "files" ? `${limits.maxFiles} files` : limitHit.kind === "size" ? formatBytes(limits.maxFileBytes).replace(/\.0 /, " ") : `${limits.maxRows.toLocaleString("en-US")} rows`}.`}
          />
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-3 border-l-2 border-mark-edge bg-mark px-3 py-2 text-sm">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
          {/* ---------- Left: files, mode, steps, workflows ---------- */}
          <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-none">
            <section aria-labelledby="files-heading" {...dragProps} className={`rounded-[12px] border-2 border-ink bg-surface p-4 ${dragOver ? "!bg-mint-soft" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 id="files-heading" className="text-[20px] font-extrabold tracking-[-0.01em]">
                  Files
                </h2>
                <span className="rounded-md bg-mint-soft px-2 py-0.5 text-[14px] font-extrabold tabular-nums">
                  {files.length} / {limits.maxFiles}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {files.map((f) => (
                  <li key={f.id} className={`rounded-lg px-3 py-2.5 ${f.id === activeFile?.id && !isMerge ? "bg-mint-soft" : "bg-paper"}`}>
                    <div className="flex items-start gap-2.5">
                      <svg className="mt-0.5 shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8zM14 2.5V8h5.5" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        {files.length > 1 && !isMerge ? (
                          <label className="flex items-center gap-2 text-[15px] font-extrabold">
                            <input type="radio" name="active-file" className="accent-accent" checked={f.id === activeFile?.id} onChange={() => setActiveId(f.id)} />
                            <span className="truncate">{f.name}</span>
                          </label>
                        ) : (
                          <p className="truncate text-[15px] font-extrabold">{f.name}</p>
                        )}
                        <p className="text-[12.5px] text-ink-2">
                          {f.parse.table.rows.length.toLocaleString("en-US")} rows · {f.parse.table.columns.length} columns · {formatBytes(f.size)}
                          {f.parse.encoding && f.parse.encoding !== "utf-8" ? ` · ${f.parse.encoding}` : ""}
                        </p>
                      </div>
                      <button type="button" className="shrink-0 rounded p-1 hover:bg-surface" onClick={() => downloadOriginal(f)} aria-label={`Download original ${f.name}`} title="Download original">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                        </svg>
                      </button>
                      <button type="button" className="shrink-0 rounded p-1 hover:bg-surface" onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[34px] text-[13px] text-ink-2">
                      {f.parse.sheets && f.parse.sheets.length > 1 && (
                        <label className="flex items-center gap-1.5">
                          Sheet
                          <select className="field min-h-0 w-auto py-0.5 text-[12px]" value={f.sheet} onChange={(e) => void reparse(f.id, { sheet: e.target.value })}>
                            {f.parse.sheets.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {f.parse.sheets && (
                        <label className="flex items-center gap-1.5">
                          Dates
                          <select className="field min-h-0 w-auto py-0.5 text-[12px]" value={f.dateMode} onChange={(e) => void reparse(f.id, { dateMode: e.target.value as XlsxDateMode })}>
                            <option value="display">as shown in Excel</option>
                            <option value="iso">as ISO (YYYY-MM-DD)</option>
                          </select>
                        </label>
                      )}
                    </div>
                    {f.parse.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-[34px] text-[12px] text-ink-2">
                        {f.parse.warnings.map((w, i) => (
                          <li key={i}>⚠ {w}</li>
                        ))}
                      </ul>
                    )}
                    <label className="mt-2 flex items-center gap-2 text-[14px] font-medium">
                      <input type="checkbox" className="h-[18px] w-[18px] accent-accent" checked={f.hasHeader} onChange={(e) => void reparse(f.id, { hasHeader: e.target.checked })} />
                      First row is the header
                    </label>
                  </li>
                ))}
              </ul>
              {filesOffer && (
                <p className="mt-3 rounded-lg bg-lemon-soft px-3 py-2 text-[14px] font-medium">
                  That&apos;s {limits.maxFiles} of {limits.maxFiles} files on the {limits.planName} plan. {filesOffer.planName} cleans {filesOffer.maxFiles} at once.{" "}
                  <Link
                    href={signedIn ? "/pricing" : `/signup?plan=${filesOffer.planId}`}
                    className="font-extrabold underline decoration-2 underline-offset-2"
                    onClick={() => track("upgrade_clicked", { from: "files", plan: filesOffer.planId as "pro" })}
                  >
                    Get {filesOffer.planName}
                  </Link>
                </p>
              )}
              {files.length < limits.maxFiles && (
                <button
                  type="button"
                  className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-accent text-[16px] font-extrabold text-accent hover:bg-mint-soft disabled:opacity-50"
                  onClick={() => fileInput.current?.click()}
                  disabled={loading}
                >
                  <span aria-hidden="true" className="text-[20px] leading-none">+</span> Add another file
                </button>
              )}
              {fileInputEl}
            </section>

            {files.length > 1 && (
              <fieldset className="rounded-[12px] border-2 border-ink bg-surface px-4 py-3">
                <legend className="sr-only">What to do with several files</legend>
                <p className="mb-1 text-sm font-semibold">Several files</p>
                <label className="flex items-start gap-2 py-0.5 text-[13px]">
                  <input type="radio" name="mode" className="mt-0.5 accent-accent" checked={mode === "merge"} onChange={() => setMode("merge")} />
                  <span>
                    <strong className="font-medium">Merge</strong> into one table (stack rows, line up columns by name)
                  </span>
                </label>
                <label className="flex items-start gap-2 py-0.5 text-[13px]">
                  <input type="radio" name="mode" className="mt-0.5 accent-accent" checked={mode === "batch"} onChange={() => setMode("batch")} />
                  <span>
                    <strong className="font-medium">Batch</strong>: clean each file separately with the same steps
                  </span>
                </label>
              </fieldset>
            )}

            {isMerge && shown?.mergeReport && (
              <MergePanel
                files={files}
                merge={merge}
                setMerge={setMerge}
                targets={shown.input.columns.filter((c) => !(merge.addSource && c === shown.input.columns[shown.input.columns.length - 1]))}
                placements={shown.mergeReport.placements}
                warnings={shown.mergeReport.warnings}
              />
            )}

            <section aria-labelledby="steps-heading" className="rounded-[12px] border-2 border-ink bg-surface p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="steps-heading" className="text-[20px] font-extrabold tracking-[-0.01em]">
                  Cleaning steps <span className="ml-1 text-[13px] font-medium text-ink-2">Run from top to bottom</span>
                </h2>
                <button type="button" className="text-[13px] font-bold underline underline-offset-2" onClick={resetSteps}>
                  Reset
                </button>
              </div>
              <ol className="flex flex-col gap-2">
                {steps.map((s, i) => (
                  <StepCard
                    key={s.id ?? i}
                    step={s}
                    index={i}
                    total={steps.length}
                    run={shown?.result.steps[i]?.step.id === s.id ? shown?.result.steps[i] : undefined}
                    stale={pending}
                    columns={columnsBefore(i)}
                    update={(next) => updateStep(i, next)}
                    remove={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    move={(d) => moveStep(i, d)}
                    drag={{
                      over: dragOverIdx === i && dragFrom !== null && dragFrom !== i,
                      onDragStart: () => setDragFrom(i),
                      onDragOver: (e) => {
                        if (dragFrom === null) return;
                        e.preventDefault();
                        setDragOverIdx(i);
                      },
                      onDrop: () => {
                        if (dragFrom !== null) reorderStep(dragFrom, i);
                        setDragFrom(null);
                        setDragOverIdx(null);
                      },
                      onDragEnd: () => {
                        setDragFrom(null);
                        setDragOverIdx(null);
                      },
                    }}
                  />
                ))}
              </ol>
              <div className="mt-3 flex gap-2">
                <label htmlFor="add-step" className="sr-only">
                  Step to add
                </label>
                <select id="add-step" className="field !min-h-10 !rounded-lg !border-2 !border-ink !text-[15px]" value={addType} onChange={(e) => setAddType(e.target.value as StepType)}>
                  {ADDABLE.map((t) => (
                    <option key={t} value={t}>
                      {STEP_META[t].label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn shrink-0 !min-h-10 !border-2 !text-[15px] !font-extrabold" onClick={addStep}>
                  + Add step
                </button>
              </div>
            </section>

            <WorkflowPanel
              steps={steps}
              entitlements={entitlements}
              onAccountChange={() => void refreshEntitlements()}
              onLoad={(s) => {
                setSteps(s);
                setStatus("Workflow applied.");
              }}
            />
          </div>

          {/* ---------- Right: preview and downloads ---------- */}
          <section aria-labelledby="preview-heading" className="order-1 flex min-w-0 flex-col gap-3 lg:order-none">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
              <p className="min-w-0 truncate">
                <button type="button" className="font-bold underline underline-offset-2" onClick={startOver}>
                  Cleaner
                </button>
                <span className="mx-2 text-ink-3" aria-hidden="true">/</span>
                <span className="font-medium">{isMerge ? "Merged table" : activeFile?.name}</span>
              </p>
              <button type="button" className="font-bold underline underline-offset-2" onClick={startOver}>
                Start over
              </button>
            </div>
            <ol className="grid gap-2 sm:grid-cols-3" aria-label="Progress">
              {[
                ["Add files", true],
                ["Choose cleaning steps", true],
                ["Review & download", downloaded],
              ].map(([label, done], i) => {
                const current = i === 2;
                return (
                  <li
                    key={label as string}
                    aria-current={current ? "step" : undefined}
                    className={`flex items-center justify-center gap-2.5 rounded-lg border-2 px-3 py-2 text-[15px] font-extrabold ${
                      current ? "border-ink bg-accent text-white" : "border-accent/40 bg-mint-soft"
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${current && !done ? "bg-white text-accent" : "bg-ok text-white"}`}>
                      {done ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-label="done">
                          <path d="m4.5 12.5 5 5 10-11" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </span>
                    {i + 1} {label}
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id="preview-heading" className="display text-[2rem] sm:text-[2.4rem]">
                  Review your cleaned data
                </h2>
                <p className="mt-1 text-[16px] font-medium text-ink-2">
                  {isMerge ? `${files.length} files merged` : activeFile?.name}
                </p>
                {result && !pending && <RinseMeter key={`${result.changedCount}:${result.removed.length}`} fixed={result.changedCount} removed={result.removed.length} />}
              </div>
              {!isBatch && (
                <button type="button" className="btn-pop !min-h-11 !px-4 !text-[16px]" onClick={() => void downloadCsv()} disabled={!ready || exporting} aria-describedby="dl-heading">
                  Download CSV
                </button>
              )}
            </div>

            {runError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-del-ink bg-del px-3 py-2 text-sm text-del-ink">
                <p>{runError}</p>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setRunError(null);
                    setRunNonce((n) => n + 1);
                  }}
                >
                  Run again
                </button>
              </div>
            )}

            {isBatch && batch.length > 0 && (
              <div className="overflow-x-auto border border-rule bg-surface">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Batch results per file</caption>
                  <thead className="bg-sunken text-left text-xs text-ink-2">
                    <tr>
                      <th scope="col" className="px-3 py-1.5 font-semibold">File</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">Rows in</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">Rows out</th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">Cells changed</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {batch.map((b) => {
                      const f = files.find((x) => x.id === b.fileId);
                      return (
                        <tr key={b.fileId} className="border-t border-rule">
                          <td className="max-w-[24ch] truncate px-3 py-1.5 font-sans">{f?.name}</td>
                          <td className="px-3 py-1.5 text-right">{b.res.input.rows.length.toLocaleString("en-US")}</td>
                          <td className="px-3 py-1.5 text-right">{b.res.result.table.rows.length.toLocaleString("en-US")}</td>
                          <td className="px-3 py-1.5 text-right">{b.res.result.changedCount.toLocaleString("en-US")}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button type="button" className="btn btn-sm font-sans" onClick={() => setActiveId(b.fileId)} aria-pressed={b.fileId === activeFile?.id}>
                              Preview
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {result && input && (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Rows", `${input.rows.length.toLocaleString("en-US")} → ${result.table.rows.length.toLocaleString("en-US")}`],
                    ["Rows removed", result.removed.length.toLocaleString("en-US")],
                    ["Cells changed", result.changedCount.toLocaleString("en-US")],
                    ["Columns", `${input.columns.length} → ${result.table.columns.length}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-[12px] border-[3px] border-ink bg-surface px-4 py-3">
                      <dt className="text-[14px] font-bold">{k}</dt>
                      <dd className={`display text-[2.2rem] leading-none tabular-nums ${pending ? "text-ink-3" : ""}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {removedByStep.length > 0 && (
                  <p className="text-[12.5px] text-ink-2">
                    Removed: {removedByStep.map(([label, n]) => `${n} by “${label}”`).join(", ")}. Review them in the Removed rows tab before downloading.
                  </p>
                )}

                {dateChoices.map((n) => (
                  <div key={n.column} role="group" aria-label="Date order needed" className="flex flex-col gap-3 rounded-lg border-2 border-mark-edge/40 bg-lemon-soft px-4 py-3 md:flex-row md:items-center">
                    <svg className="hidden shrink-0 sm:block" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3 2 20.5h20z" />
                      <path d="M12 10v5M12 17.6v.2" strokeLinecap="round" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-extrabold">Confirm the date format for {n.column}</p>
                      <p className="text-[15px]">
                        {n.reason === "conflict" ? (
                          "This column mixes day-first and month-first dates."
                        ) : (
                          <>
                            <strong>{n.examples[0] ?? "03/04"}</strong> could mean two different days.
                          </>
                        )}{" "}
                        These dates stay unchanged until you choose.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {(["DMY", "MDY"] as const).map((o) => (
                        <button
                          key={o}
                          type="button"
                          className="btn !min-h-10 !border-2 !font-extrabold"
                          onClick={() => {
                            const st = steps[dateIdx];
                            if (st?.type === "formatDates") updateStep(dateIdx, { ...st, orderByColumn: { ...st.orderByColumn, [n.column]: o } });
                          }}
                        >
                          {o === "DMY" ? "Day first (DMY)" : "Month first (MDY)"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="rounded-[12px] border-2 border-ink bg-surface p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div role="tablist" aria-label="Preview" className="flex gap-1.5">
                    {(
                      [
                        ["cleaned", "Cleaned"],
                        ["original", "Original"],
                        ["removed", `Removed rows (${result.removed.length})`],
                      ] as [View, string][]
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="tab"
                        aria-selected={view === v}
                        className={`rounded-lg border-2 px-4 py-1.5 text-[15px] font-bold ${view === v ? "border-ink bg-accent text-white" : "border-transparent bg-surface hover:border-rule-strong"}`}
                        onClick={() => setView(v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {view === "cleaned" && (
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] font-medium">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-accent" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
                        Only changed rows
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="accent-accent" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />
                        Show old values
                      </label>
                    </div>
                  )}
                </div>

                <div aria-busy={pending} className="mt-3">
                  {view === "cleaned" && (
                    <DataGrid
                      key={`c-${result.table.rows.length}-${onlyChanged}`}
                      caption="Cleaned data. Highlighted cells were changed."
                      columns={result.table.columns}
                      rows={result.table.rows}
                      rowNumbers={result.rowOrigins.map((o) => o + 1)}
                      visible={onlyChanged ? changedRows : undefined}
                      isChanged={(r, c) => isCellChanged(result, r, c)}
                      originalValue={(r, c) => {
                        const oc = result.columnOrigins[c];
                        if (oc === null || oc === undefined) return undefined;
                        return input.rows[result.rowOrigins[r]!]?.[oc];
                      }}
                      showOriginal={showOriginal}
                      flaggedColumns={dateChoices.map((n) => result.table.columns.indexOf(n.column)).filter((i) => i >= 0)}
                      headerNotes={result.table.columns.map((name, c) => {
                        const oc = result.columnOrigins[c];
                        if (oc === null || oc === undefined) return "new column";
                        return input.columns[oc] !== name ? `was “${input.columns[oc]}”` : null;
                      })}
                    />
                  )}
                  {view === "original" && (
                    <DataGrid
                      key={`o-${input.rows.length}`}
                      caption="Original data. Highlighted cells will be changed; dots mark stray spaces."
                      columns={input.columns}
                      rows={input.rows}
                      isChanged={(r, c) => originalMarks.has(r * input.columns.length + c)}
                      revealWhitespace
                    />
                  )}
                  {view === "removed" && (
                    <DataGrid
                      key={`r-${result.removed.length}`}
                      caption="Rows the cleaning steps removed, with the original row number and the reason."
                      columns={input.columns}
                      rows={result.removed.map((r) => r.values)}
                      rowNumbers={result.removed.map((r) => r.originalIndex + 1)}
                      extraColumn={{ label: "Removed by", values: result.removed.map((r) => STEP_META[r.stepType].label) }}
                      tone="removed"
                      revealWhitespace
                    />
                  )}
                </div>
                </div>

                <section aria-labelledby="dl-heading" className="rounded-[12px] border-2 border-ink bg-surface px-4 py-4 sm:px-5">
                  <h3 id="dl-heading" className="text-[24px] font-extrabold tracking-[-0.02em]">
                    Download your file
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    <button type="button" className="btn btn-primary !min-h-11 !border-2 !px-4 !text-[16px] !font-extrabold" onClick={() => void downloadCsv()} disabled={!ready || exporting}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                      </svg>
                      Download cleaned CSV
                    </button>
                    <button type="button" className="btn !min-h-11 !border-2 !px-4 !text-[16px] !font-bold" onClick={() => void downloadXlsx()} disabled={!ready || exporting}>
                      Download cleaned XLSX
                    </button>
                    {isBatch && (
                      <>
                        <button type="button" className="btn !min-h-11 !border-2 !px-4 !text-[16px] !font-bold" onClick={() => void downloadZip("csv")} disabled={!ready || exporting}>
                          All files → ZIP of CSVs
                        </button>
                        <button type="button" className="btn !min-h-11 !border-2 !px-4 !text-[16px] !font-bold" onClick={() => void downloadZip("xlsx")} disabled={!ready || exporting}>
                          All files → ZIP of XLSX
                        </button>
                        <button type="button" className="btn !min-h-11 !border-2 !px-4 !text-[16px] !font-bold" onClick={() => void downloadBatchXlsx()} disabled={!ready || exporting}>
                          All files → one XLSX
                        </button>
                      </>
                    )}
                    {activeFile && !isMerge && (
                      <button type="button" className="btn !min-h-11 !border-2 !px-4 !text-[16px] !font-bold" onClick={() => downloadOriginal(activeFile)}>
                        Download original
                      </button>
                    )}
                  </div>
                  {!ready && !runError && <p className="mt-2 text-[12px] text-ink-3">Updating preview… downloads unlock when the preview matches your steps.</p>}
                  {paywall && (
                    <div className="mt-4">
                      <DownloadPaywall
                        rows={paywall.rows}
                        reason={paywall.reason}
                        downloadRows={freeLimits.downloadRows}
                        downloadsPerDay={freeLimits.downloadsPerDay}
                        pass={pass}
                        pro={proOffer}
                        signedIn={signedIn}
                        beforeCheckout={keepWork}
                        onClose={() => setPaywall(null)}
                      />
                    </div>
                  )}
                  {activePass && (
                    <div className="mt-4">
                      <PassActiveNote pass={activePass} />
                    </div>
                  )}
                  <fieldset className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t-2 border-rule pt-3 text-[14px] font-medium">
                    <legend className="mb-2 text-[14px] font-extrabold">CSV options</legend>
                    <label className="flex items-center gap-1.5">
                      Separator
                      <select className="field min-h-0 w-auto py-0.5 text-[12px]" value={csvOpts.delimiter} onChange={(e) => setCsvOpts({ ...csvOpts, delimiter: e.target.value })}>
                        <option value=",">comma</option>
                        <option value=";">semicolon</option>
                        <option value={"\t"}>tab</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="accent-accent" checked={csvOpts.bom} onChange={(e) => setCsvOpts({ ...csvOpts, bom: e.target.checked })} />
                      Excel-friendly (UTF-8 BOM)
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={csvOpts.lineEnding === "crlf"}
                        onChange={(e) => setCsvOpts({ ...csvOpts, lineEnding: e.target.checked ? "crlf" : "lf" })}
                      />
                      Windows line endings (CRLF)
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="accent-accent" checked={csvOpts.guardFormulas} onChange={(e) => setCsvOpts({ ...csvOpts, guardFormulas: e.target.checked })} />
                      Neutralize formulas (=, +, @)
                    </label>
                  </fieldset>
                  <p className="mt-3 flex items-center gap-2 border-t-2 border-rule pt-3 text-[14px] font-medium text-ink-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ok)" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z" />
                    </svg>
                    Files are processed in your browser and never uploaded.
                  </p>
                </section>
                {repeatOffer && (
                  <UpgradeNotice
                    offer={repeatOffer}
                    from="download"
                    signedIn={signedIn}
                    title="Cleaning this export again next month?"
                    body={
                      repeatOffer.savedWorkflows !== 0
                        ? `${repeatOffer.planName} saves these ${steps.length} steps to your account, so the next file takes one click on any device.`
                        : undefined
                    }
                  />
                )}
                {source === "sample" && downloaded && (
                  <p className="rounded-lg border-2 border-ink bg-mint-soft px-4 py-3 text-[16px] font-bold">
                    That was the sample. Now try your own file: drop it anywhere on this page, or{" "}
                    <button type="button" className="underline decoration-2 underline-offset-4" onClick={() => { startOver(); requestAnimationFrame(() => fileInput.current?.click()); }}>
                      choose a file
                    </button>
                    .
                  </p>
                )}
              </>
            )}
            {!result && !runError && <p className="text-sm text-ink-3">{pending || loading ? "Cleaning…" : ""}</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function MergePanel({
  files,
  merge,
  setMerge,
  targets,
  placements,
  warnings,
}: {
  files: LoadedFile[];
  merge: MergeState;
  setMerge: (m: MergeState) => void;
  targets: string[];
  placements: Record<string, string>[];
  warnings: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="merge-heading" className="rounded-[12px] border-2 border-ink bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-rule px-3 py-2">
        <h2 id="merge-heading" className="text-sm font-semibold">
          Merge settings
        </h2>
        <button type="button" className="text-[12px] font-medium text-accent hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide column matching" : "Column matching"}
        </button>
      </div>
      <div className="space-y-1.5 px-3 py-2 text-[13px] text-ink-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent" checked={merge.looseMatch} onChange={(e) => setMerge({ ...merge, looseMatch: e.target.checked })} />
          Match headers that differ only in case or punctuation (E-mail = email)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent" checked={merge.addSource} onChange={(e) => setMerge({ ...merge, addSource: e.target.checked })} />
          Add a column with the source file name
        </label>
        {warnings.length > 0 && (
          <ul className="space-y-0.5 text-[11.5px]">
            {warnings.slice(0, 6).map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </div>
      {open && (
        <div className="max-h-80 space-y-3 overflow-auto border-t border-rule bg-paper px-3 py-3">
          {files.map((f, fi) => (
            <fieldset key={f.id}>
              <legend className="label truncate">{f.name}</legend>
              <div className="space-y-1">
                {f.parse.table.columns.map((col) => {
                  const current = merge.mappings[f.id]?.[col] ?? placements[fi]?.[col] ?? col;
                  return (
                    <label key={col} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[12px]">
                      <span className="truncate font-mono" title={col}>
                        {col}
                      </span>
                      <span aria-hidden="true" className="text-ink-3">
                        →
                      </span>
                      <select
                        className="field min-h-0 py-0.5 text-[12px]"
                        aria-label={`Column for ${col} from ${f.name}`}
                        value={current}
                        onChange={(e) => setMerge({ ...merge, mappings: { ...merge.mappings, [f.id]: { ...merge.mappings[f.id], [col]: e.target.value } } })}
                      >
                        {Array.from(new Set([...targets, col])).map((t) => (
                          <option key={t} value={t}>
                            {t === col && !targets.includes(col) ? `${t} (own column)` : t}
                          </option>
                        ))}
                        <option value="">(leave out)</option>
                      </select>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setMerge({ ...merge, mappings: {} })}>
            Reset matching
          </button>
        </div>
      )}
    </section>
  );
}
