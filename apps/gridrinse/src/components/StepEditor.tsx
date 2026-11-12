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
}) {
  const meta = STEP_META[step.type];
  const needsChoice = (run?.report.details?.needsChoice as DateNeedsChoice[] | undefined) ?? [];
  const [open, setOpen] = useState(false);
  const optionsId = useId();
  const destructive = isDestructive(step);
  const hasOptions = step.type !== "removeBlankRows";
  return (
    <li className={`border border-rule bg-surface ${step.enabled ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <span className="mt-0.5 w-5 shrink-0 font-mono text-[11px] text-ink-3">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="accent-accent" checked={step.enabled} onChange={(e) => update({ ...step, enabled: e.target.checked })} />
            {meta.label}
            {destructive && <span className="rounded-sm border border-del-ink/40 px-1 text-[10px] font-medium uppercase tracking-wide text-del-ink">removes data</span>}
          </label>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{meta.explain}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="btn btn-sm px-1.5" onClick={() => move(-1)} disabled={index === 0} aria-label={`Move ${meta.label} up`}>
            ↑
          </button>
          <button type="button" className="btn btn-sm px-1.5" onClick={() => move(1)} disabled={index === total - 1} aria-label={`Move ${meta.label} down`}>
            ↓
          </button>
          <button type="button" className="btn btn-sm px-1.5" onClick={remove} aria-label={`Remove step ${meta.label}`}>
            ×
          </button>
        </div>
      </div>

      {needsChoice.length > 0 && step.enabled && (
        <div className="mx-3 mt-2 border-l-2 border-mark-edge bg-mark/60 px-3 py-2 text-[12.5px]" role="group" aria-label="Date order needed">
          {needsChoice.map((n) => (
            <div key={n.column} className="py-1">
              <p>
                <strong className="font-semibold">{n.column}</strong>:{" "}
                {n.reason === "conflict" ? "this column mixes day-first and month-first dates." : `dates like ${n.examples[0] ?? "03/04"} could be either order.`} Which is it?
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button type="button" className="btn btn-sm" onClick={() => step.type === "formatDates" && update({ ...step, orderByColumn: { ...step.orderByColumn, [n.column]: "DMY" } })}>
                  Day first (DMY)
                </button>
                <button type="button" className="btn btn-sm" onClick={() => step.type === "formatDates" && update({ ...step, orderByColumn: { ...step.orderByColumn, [n.column]: "MDY" } })}>
                  Month first (MDY)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {step.type === "formatDates" && Object.keys(step.orderByColumn).length > 0 && (
        <p className="mx-3 mt-2 text-[12px] text-ink-2">
          Chosen order:{" "}
          {Object.entries(step.orderByColumn).map(([c, o], i) => (
            <span key={c}>
              {i > 0 && ", "}
              <span className="font-mono">{c}</span> = {o}{" "}
              <button
                type="button"
                className="text-accent underline"
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

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-2">
        <StepReport run={run} stale={stale} enabled={step.enabled} />
        {hasOptions && (
          <button type="button" className="text-[12px] font-medium text-accent hover:underline" aria-expanded={open} aria-controls={optionsId} onClick={() => setOpen(!open)}>
            {open ? "Hide options" : "Options"}
          </button>
        )}
      </div>
      {hasOptions && open && (
        <div id={optionsId} className="border-t border-rule bg-paper px-3 py-3">
          <StepOptions step={step} update={update} columns={columns} />
        </div>
      )}
    </li>
  );
}

function StepReport({ run, stale, enabled }: { run?: StepRun; stale: boolean; enabled: boolean }) {
  if (!enabled) return <span className="font-mono text-[11.5px] text-ink-3">off</span>;
  if (!run || stale) return <span className="font-mono text-[11.5px] text-ink-3">…</span>;
  if (run.error) return <span className="text-[12px] text-del-ink">Not applied: {run.error}</span>;
  const r = run.report;
  const bits: string[] = [];
  if (r.rowsRemoved) bits.push(`−${r.rowsRemoved.toLocaleString("en-US")} rows`);
  if (r.cellsChanged) bits.push(`${r.cellsChanged.toLocaleString("en-US")} cells`);
  const renamed = (r.details?.renamed as unknown[] | undefined)?.length;
  if (renamed) bits.push(`${renamed} headers`);
  return (
    <span className="min-w-0 text-[12px]">
      <span className={`font-mono ${bits.length ? "text-ink" : "text-ink-3"}`}>{bits.length ? bits.join(" · ") : "no changes"}</span>
      {r.warnings.length > 0 && (
        <ul className="mt-1 list-none space-y-0.5 text-[11.5px] text-ink-2">
          {r.warnings.slice(0, 3).map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </span>
  );
}
