/** Small shared form/UI pieces in the report's visual language (paper, ink, one accent). */
import type { InputHTMLAttributes, ReactNode } from "react";

export const inputClass =
  "min-h-12 w-full rounded-xl border border-rule-strong bg-white px-4 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60";
export const primaryButton =
  "btn-primary disabled:opacity-60";
export const secondaryButton =
  "btn-secondary disabled:opacity-60";
export const dangerButton =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-fail-wash px-5 font-semibold text-fail transition-colors hover:bg-[#fbd3d6] disabled:opacity-60";

export function Field({ label, hint, id, ...props }: { label: string; hint?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-ink">
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
    <div role={role} className={`rounded-xl border-l-4 px-4 py-3 text-ink ${cls}`}>
      {children}
    </div>
  );
}

export function PageTitle({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: ReactNode }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-3 text-[2.6rem] sm:text-6xl">{title}</h1>
      {lede && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{lede}</p>}
    </>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
}
