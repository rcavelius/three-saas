/** Small shared form/UI pieces in the report's visual language (paper, ink, one accent). */
import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "num min-h-11 w-full rounded-none border border-ink bg-sheet px-3 text-base text-ink placeholder:text-muted/70 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center bg-accent px-5 font-medium text-white hover:bg-accent-hover disabled:opacity-60";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center border border-ink px-5 font-medium text-ink hover:bg-paper-deep disabled:opacity-60";
export const dangerButton =
  "inline-flex min-h-11 items-center justify-center border border-fail px-5 font-medium text-fail hover:bg-fail-wash disabled:opacity-60";

export function Field({ label, hint, id, ...props }: { label: string; hint?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`mt-1 ${inputClass}`} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Notice({ tone = "info", children, role }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; role?: "alert" | "status" }) {
  const cls = {
    info: "border-accent bg-accent-wash",
    ok: "border-pass bg-pass-wash",
    warn: "border-warn bg-warn-wash",
    error: "border-fail bg-fail-wash",
  }[tone];
  return (
    <div role={role} className={`border-l-2 px-4 py-3 text-ink ${cls}`}>
      {children}
    </div>
  );
}

export function PageTitle({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: ReactNode }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
      {lede && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{lede}</p>}
    </>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
}
