"use client";

import { useState } from "react";
import { copyText } from "@/lib/client";

const METHOD_COLOR: Record<string, string> = {
  GET: "var(--color-m-get)",
  POST: "var(--color-m-post)",
  PUT: "var(--color-m-put)",
  PATCH: "var(--color-m-patch)",
  DELETE: "var(--color-m-delete)",
  HEAD: "var(--color-m-head)",
  OPTIONS: "var(--color-m-options)",
};

export function MethodBadge({ method, className = "" }: { method: string; className?: string }) {
  const color = METHOD_COLOR[method] ?? "var(--color-fg-muted)";
  return (
    <span
      className={`inline-flex items-center justify-center h-5 min-w-[3.75rem] px-1.5 rounded-[3px] border font-mono text-[10.5px] font-semibold tracking-wide ${className}`}
      style={{ color, borderColor: `color-mix(in oklab, ${color} 40%, transparent)`, background: `color-mix(in oklab, ${color} 9%, transparent)` }}
    >
      {method}
    </span>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  className = "btn",
  ariaLabel,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={async () => {
        const ok = await copyText(typeof text === "function" ? text() : text);
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1400);
      }}
    >
      <span aria-live="polite">{state === "ok" ? "Copied" : state === "fail" ? "Copy failed" : label}</span>
    </button>
  );
}
