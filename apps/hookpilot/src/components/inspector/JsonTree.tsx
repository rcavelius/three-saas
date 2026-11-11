"use client";

import { useState } from "react";

const PAGE = 200;

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-m-put">null</span>;
  switch (typeof value) {
    case "string":
      return <span className="text-m-post break-all">&quot;{value}&quot;</span>;
    case "number":
      return <span className="text-m-get">{String(value)}</span>;
    case "boolean":
      return <span className="text-m-put">{String(value)}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

function Node({ name, value, depth, isLast }: { name: string | null; value: unknown; depth: number; isLast: boolean }) {
  const isArr = Array.isArray(value);
  const isObj = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < 2);
  const [shown, setShown] = useState(PAGE);
  const comma = isLast ? "" : ",";
  const key =
    name === null ? null : (
      <>
        <span className="text-fg-muted">{/^\d+$/.test(name) ? name : `"${name}"`}</span>
        <span className="text-fg-dim">: </span>
      </>
    );

  if (!isObj) {
    return (
      <div className="pl-4">
        {key}
        <Primitive value={value} />
        <span className="text-fg-dim">{comma}</span>
      </div>
    );
  }

  const entries: [string, unknown][] = isArr ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as object);
  const [openB, closeB] = isArr ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) {
    return (
      <div className="pl-4">
        {key}
        <span className="text-fg-dim">
          {openB}
          {closeB}
          {comma}
        </span>
      </div>
    );
  }
  return (
    <div className="pl-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-ml-4 w-4 inline-block text-fg-dim hover:text-fg rounded-sm"
        aria-label={`${open ? "Collapse" : "Expand"} ${name ?? "root"}`}
      >
        {open ? "▾" : "▸"}
      </button>
      {key}
      <span className="text-fg-dim">{openB}</span>
      {open ? (
        <>
          {entries.slice(0, shown).map(([k, v], i) => (
            <Node key={k} name={isArr ? k : k} value={v} depth={depth + 1} isLast={i === entries.length - 1} />
          ))}
          {entries.length > shown && (
            <div className="pl-4">
              <button type="button" className="text-signal underline underline-offset-2" onClick={() => setShown((s) => s + PAGE)}>
                show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown}
              </button>
            </div>
          )}
          <span className="text-fg-dim">
            {closeB}
            {comma}
          </span>
        </>
      ) : (
        <span className="text-fg-dim">
          {" "}
          {entries.length} {isArr ? "items" : "keys"} {closeB}
          {comma}
        </span>
      )}
    </div>
  );
}

export function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="font-mono text-[12.5px] leading-[1.65] -ml-4">
      <Node name={null} value={value} depth={0} isLast />
    </div>
  );
}
