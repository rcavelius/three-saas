"use client";

import { useId, useState } from "react";
import type { DateNeedsChoice } from "@/lib/engine/ops/dates";
import type { StepRun } from "@/lib/engine/pipeline";
import { isDestructive, type Step } from "@/lib/engine/schema";
import { STEP_META } from "@/lib/steps";

type Update = (step: Step) => void;

export function ColumnPicker({
  label,
  available,
  value,
  onChange,
  emptyHint,
}: {
  label: string;
  available: string[];
  value: string[];
  onChange: (cols: string[]) => void;
  emptyHint: string;
}) {
  const missing = value.filter((v) => !available.includes(v));
  const all = [...available, ...missing];
  return (
    <fieldset className="min-w-0">
      <legend className="label">{label}</legend>
      <div className="max-h-36 overflow-auto rounded-[3px] border border-rule bg-surface px-2 py-1">
        {all.length === 0 && <p className="text-xs text-ink-3">Load a file to choose columns.</p>}
        {all.map((c) => (
          <label key={c} className="flex items-center gap-2 py-0.5 text-[13px]">
            <input
              type="checkbox"
              checked={value.includes(c)}
              onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((v) => v !== c))}
              className="accent-accent"
            />
            <span className="truncate font-mono text-[12px]">{c}</span>
            {missing.includes(c) && <span className="text-[11px] text-del-ink">not in this file</span>}
          </label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-3">{value.length === 0 ? emptyHint : `${value.length} selected`}</p>
    </fieldset>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-ink-2">
      <input type="checkbox" className="mt-0.5 accent-accent" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Text({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className={`field ${mono ? "font-mono text-[13px]" : ""}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const DATE_FORMATS: [string, string][] = [
  ["YYYY-MM-DD", "2024-01-31 (ISO, sorts correctly)"],
  ["MM/DD/YYYY", "01/31/2024 (US)"],
  ["DD/MM/YYYY", "31/01/2024 (UK/EU)"],
  ["DD.MM.YYYY", "31.01.2024"],
  ["D MMM YYYY", "31 Jan 2024"],
  ["MMM D, YYYY", "Jan 31, 2024"],
];

function StepOptions({ step, update, columns }: { step: Step; update: Update; columns: string[] }) {
  switch (step.type) {
    case "normalizeHeaders":
      return (
        <Select
          label="Header style"
          value={step.style}
          options={[
            ["keep", "Keep as is (trim only)"],
            ["snake", "snake_case"],
            ["title", "Title Case"],
            ["lower", "lower case"],
          ]}
          onChange={(style) => update({ ...step, style })}
        />
      );
    case "trim":
      return (
        <div className="space-y-2">
          <Check label="Squeeze repeated spaces inside cells" checked={step.collapseInternal} onChange={(v) => update({ ...step, collapseInternal: v })} />
          <Check label="Fix invisible characters (non-breaking, zero-width)" checked={step.removeInvisible} onChange={(v) => update({ ...step, removeInvisible: v })} />
          <ColumnPicker label="Columns" available={columns} value={step.columns} onChange={(c) => update({ ...step, columns: c })} emptyHint="None ticked = all columns." />
        </div>
      );
    case "removeBlankRows":
      return null;
    case "dedupe":
      return (
        <div className="space-y-2">
          <ColumnPicker label="Compare by" available={columns} value={step.keys} onChange={(keys) => update({ ...step, keys })} emptyHint="None ticked = whole row must match." />
          <Select
            label="When duplicates are found, keep"
            value={step.keep}
            options={[
              ["first", "the first one"],
              ["last", "the last one (e.g. latest update)"],
            ]}
            onChange={(keep) => update({ ...step, keep })}
          />
          <Check label="Ignore upper/lower case" checked={step.ignoreCase} onChange={(v) => update({ ...step, ignoreCase: v })} />
          <Check label="Ignore extra spaces" checked={step.ignoreWhitespace} onChange={(v) => update({ ...step, ignoreWhitespace: v })} />
        </div>
      );
    case "formatDates":
      return (
        <div className="space-y-2">
          <Select label="Output format" value={step.outputFormat} options={DATE_FORMATS.some(([f]) => f === step.outputFormat) ? DATE_FORMATS : [...DATE_FORMATS, [step.outputFormat, step.outputFormat]]} onChange={(outputFormat) => update({ ...step, outputFormat })} />
          <Select
            label="Ambiguous dates like 03/04/2024"
            value={step.order}
            options={[
              ["auto", "Decide per column from the data; ask me if unclear"],
              ["DMY", "Always day first (3 April)"],
              ["MDY", "Always month first (March 4)"],
            ]}
            onChange={(order) => update({ ...step, order })}
          />
          <Check label="Keep times after the date" checked={step.keepTime} onChange={(v) => update({ ...step, keepTime: v })} />
          <ColumnPicker
            label="Columns"
            available={columns}
            value={step.columns ?? []}
            onChange={(c) => update({ ...step, columns: c.length ? c : null })}
            emptyHint="None ticked = detect date columns automatically."
          />
          {step.columns && step.columns.length > 0 && (
            <Check label="Treat plain numbers as Excel date serials (45296 = 2024-01-05)" checked={step.excelSerials} onChange={(v) => update({ ...step, excelSerials: v })} />
          )}
        </div>
      );
    case "formatNumbers":
      return (
        <div className="space-y-2">
          <ColumnPicker label="Columns" available={columns} value={step.columns} onChange={(c) => update({ ...step, columns: c })} emptyHint="Tick the columns that hold amounts." />
          <Select
            label="Decimals"
            value={step.decimals === null ? "keep" : String(step.decimals)}
            options={[
              ["keep", "Keep as written"],
              ["0", "0"],
              ["1", "1"],
              ["2", "2"],
              ["3", "3"],
              ["4", "4"],
            ]}
            onChange={(v) => update({ ...step, decimals: v === "keep" ? null : Number(v) })}
          />
          <Select
            label="Percentages"
            value={step.percent}
            options={[
              ["keep", "Keep the % sign (12.5%)"],
              ["number", "Drop the sign (12.5)"],
              ["fraction", "As a fraction (0.125)"],
            ]}
            onChange={(percent) => update({ ...step, percent })}
          />
          <Check label="Input uses a decimal comma (1.234,50)" checked={step.decimalComma} onChange={(v) => update({ ...step, decimalComma: v })} />
          <Check label="Add thousands separators to the output (1,234.50)" checked={step.thousandsSeparator} onChange={(v) => update({ ...step, thousandsSeparator: v })} />
        </div>
      );
    case "findReplace":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Text label="Find" value={step.find} onChange={(find) => update({ ...step, find })} mono />
            <Text label="Replace with" value={step.replace} onChange={(replace) => update({ ...step, replace })} placeholder="(nothing)" mono />
          </div>
          <Check label="Whole cell must match" checked={step.wholeCell} onChange={(v) => update({ ...step, wholeCell: v })} />
          <Check label="Match case" checked={step.caseSensitive} onChange={(v) => update({ ...step, caseSensitive: v })} />
          <Check label="Regular expression" checked={step.regex} onChange={(v) => update({ ...step, regex: v })} />
          <ColumnPicker label="Columns" available={columns} value={step.columns} onChange={(c) => update({ ...step, columns: c })} emptyHint="None ticked = all columns." />
        </div>
      );
    case "renameColumns":
      return <RenameEditor step={step} update={update} columns={columns} />;
    case "reorderColumns":
      return (
        <div>
          <ColumnPicker label="Move to the front (in the order you tick them)" available={columns} value={step.order} onChange={(order) => update({ ...step, order })} emptyHint="Nothing ticked: order unchanged." />
        </div>
      );
    case "dropColumns":
      return <ColumnPicker label="Columns to remove" available={columns} value={step.columns} onChange={(c) => update({ ...step, columns: c })} emptyHint="Nothing ticked: nothing removed." />;
    case "mergeColumns":
      return (
        <div className="space-y-2">
          <ColumnPicker label="Columns to join (in order ticked)" available={columns} value={step.columns} onChange={(c) => update({ ...step, columns: c })} emptyHint="Tick at least two." />
          <div className="grid grid-cols-2 gap-2">
            <Text label="Separator" value={step.separator} onChange={(separator) => update({ ...step, separator })} mono />
            <Text label="New column name" value={step.into} onChange={(into) => update({ ...step, into })} placeholder="auto" />
          </div>
          <Check label="Keep the original columns" checked={step.keepOriginals} onChange={(v) => update({ ...step, keepOriginals: v })} />
          <Check label="Skip empty parts" checked={step.skipEmpty} onChange={(v) => update({ ...step, skipEmpty: v })} />
        </div>
      );
    case "splitColumn":
      return (
        <div className="space-y-2">
          <Select label="Column to split" value={step.column} options={(columns.includes(step.column) ? columns : [step.column, ...columns]).map((c) => [c, c] as [string, string])} onChange={(column) => update({ ...step, column })} />
          <div className="grid grid-cols-2 gap-2">
            <Text label="Separator" value={step.separator} onChange={(separator) => update({ ...step, separator })} mono />
            <Text label="New names (comma separated)" value={step.into.join(", ")} onChange={(v) => update({ ...step, into: v.split(",").map((s) => s.trim()) })} />
          </div>
          <Check label="Keep the original column" checked={step.keepOriginal} onChange={(v) => update({ ...step, keepOriginal: v })} />
        </div>
      );
  }
}

function RenameEditor({ step, update, columns }: { step: Extract<Step, { type: "renameColumns" }>; update: Update; columns: string[] }) {
  const names = Array.from(new Set([...columns, ...Object.keys(step.map)]));
  return (
    <div className="max-h-56 space-y-1 overflow-auto">
      <p className="text-[11px] text-ink-3">Type a new name next to any column. Leave blank to keep it.</p>
      {names.map((c) => (
        <label key={c} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[12px]">
          <span className="truncate font-mono" title={c}>
            {c}
          </span>
          <input
            className="field font-mono text-[12px]"
            aria-label={`New name for ${c}`}
            value={step.map[c] ?? ""}
            placeholder={c}
            onChange={(e) => {
              const map = { ...step.map };
              if (e.target.value === "") delete map[c];
              else map[c] = e.target.value;
              update({ ...step, map });
            }}
          />
        </label>
      ))}
    </div>
  );
}

export function StepCard({
  step,
  index,
  total,
  run,
  columns,
  update,
  remove,
  move,
  stale,
  drag,
}: {
  step: Step;
  index: number;
  total: number;
  run?: StepRun;
  columns: string[];
  update: Update;
  remove: () => void;
  move: (delta: -1 | 1) => void;
  stale: boolean;
  /** Drag-to-reorder wiring from the list (desktop); the up/down buttons stay for keyboards and touch. */
  drag?: { onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; onDragEnd: () => void; over: boolean };
}) {
  const meta = STEP_META[step.type];
  const needsChoice = (run?.report.details?.needsChoice as DateNeedsChoice[] | undefined) ?? [];
  const review = needsChoice.length > 0 && step.enabled;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const destructive = isDestructive(step);
  const removesRows = step.type === "removeBlankRows" || step.type === "dedupe";
  const [draggable, setDraggable] = useState(false);
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        drag?.onDragStart();
      }}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragEnd={() => {
        setDraggable(false);
        drag?.onDragEnd();
      }}
      className={`rounded-lg border-2 ${drag?.over ? "border-accent" : review ? "border-mark-edge/50" : "border-rule"} ${review ? "bg-lemon-soft" : "bg-surface"} ${
        step.enabled ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-center gap-2 py-2 pl-1.5 pr-2">
        <span
          className="hidden cursor-grab touch-none px-1 text-ink-3 select-none active:cursor-grabbing lg:block"
          aria-hidden="true"
          title="Drag to reorder"
          onMouseDown={() => setDraggable(true)}
          onMouseUp={() => setDraggable(false)}
        >
          <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
            {[3, 10, 17].flatMap((y) => [3, 11].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" />))}
          </svg>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-accent"
          checked={step.enabled}
          onChange={(e) => update({ ...step, enabled: e.target.checked })}
          aria-label={`Use step: ${meta.label}`}
        />
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="text-[13px] font-extrabold tabular-nums">{String(index + 1).padStart(2, "0")}</span>
              <span className="truncate text-[15px] font-extrabold">{meta.label}</span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-6">
              <StepSummary run={run} stale={stale} enabled={step.enabled} />
              {review ? (
                <span className="rounded-full bg-lemon px-2 py-0.5 text-[11px] font-bold">Needs review</span>
              ) : destructive ? (
                <span className="rounded-full bg-rose px-2 py-0.5 text-[11px] font-bold text-del-ink">{removesRows ? "Removes rows" : "Removes data"}</span>
              ) : null}
            </span>
          </span>
          <svg className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      {open && (
        <div id={panelId} className="border-t-2 border-rule px-3 pb-3 pt-2.5">
          <p className="text-[13px] leading-snug text-ink-2">{meta.explain}</p>
          <StepWarnings run={run} stale={stale} enabled={step.enabled} />
          {step.type === "formatDates" && Object.keys(step.orderByColumn).length > 0 && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              Chosen order:{" "}
              {Object.entries(step.orderByColumn).map(([c, o], i) => (
                <span key={c}>
                  {i > 0 && ", "}
                  <span className="font-mono">{c}</span> = {o}{" "}
                  <button
                    type="button"
                    className="font-bold underline"
                    onClick={() => {
                      const next = { ...step.orderByColumn };
                      delete next[c];
                      update({ ...step, orderByColumn: next });
                    }}
                  >
                    undo
                  </button>
                </span>
              ))}
            </p>
          )}
          {step.type !== "removeBlankRows" && (
            <div className="mt-3 rounded-md bg-paper p-3">
              <StepOptions step={step} update={update} columns={columns} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" className="btn btn-sm" onClick={() => move(-1)} disabled={index === 0} aria-label={`Move ${meta.label} up`}>
              ↑ Up
            </button>
            <button type="button" className="btn btn-sm" onClick={() => move(1)} disabled={index === total - 1} aria-label={`Move ${meta.label} down`}>
              ↓ Down
            </button>
            <button type="button" className="btn btn-sm ml-auto" onClick={remove} aria-label={`Remove step ${meta.label}`}>
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function StepSummary({ run, stale, enabled }: { run?: StepRun; stale: boolean; enabled: boolean }) {
  if (!enabled) return <span className="text-[12.5px] text-ink-3">Off</span>;
  if (!run || stale) return <span className="text-[12.5px] text-ink-3">…</span>;
  if (run.error) return <span className="text-[12.5px] text-del-ink">Not applied</span>;
  const r = run.report;
  const bits: string[] = [];
  if (r.rowsRemoved) bits.push(`−${r.rowsRemoved.toLocaleString("en-US")} ${r.rowsRemoved === 1 ? "row" : "rows"}`);
  if (r.cellsChanged) bits.push(`${r.cellsChanged.toLocaleString("en-US")} cells`);
  const renamed = (r.details?.renamed as unknown[] | undefined)?.length;
  if (renamed) bits.push(`${renamed} headers`);
  return <span className={`text-[12.5px] ${bits.length ? "text-ink-2" : "text-ink-3"}`}>{bits.length ? bits.join(" · ") : "No changes"}</span>;
}

function StepWarnings({ run, stale, enabled }: { run?: StepRun; stale: boolean; enabled: boolean }) {
  if (!enabled || !run || stale) return null;
  if (run.error) return <p className="mt-2 text-[12.5px] text-del-ink">Not applied: {run.error}</p>;
  if (run.report.warnings.length === 0) return null;
  return (
    <ul className="mt-2 list-none space-y-0.5 text-[12px] text-ink-2">
      {run.report.warnings.slice(0, 3).map((w, i) => (
        <li key={i}>⚠ {w}</li>
      ))}
    </ul>
  );
}
