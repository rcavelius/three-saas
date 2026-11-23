/** Small shared form/UI pieces in the report's visual language (paper, ink, one accent). */
import type { InputHTMLAttributes, ReactNode } from "react";
import { KiteMark } from "./SiteHeader";

export const inputClass =
  "min-h-12 w-full rounded-2xl border border-rule-strong bg-white px-4 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60";
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
      <p className="text-[0.95rem] font-bold text-muted">{eyebrow}</p>
      <h1 className="display mt-3 text-[2.5rem] sm:text-[3.5rem]">{title}</h1>
      {lede && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{lede}</p>}
    </>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
}

/**
 * The sky band that opens marketing pages (tools, guides, docs, pricing): the same field of colour as the home hero.
 * `children` sit under the lede (a form, a note).
 */
export function SkyHero({ title, lede, crumb, children, wide = false }: { title: string; lede?: ReactNode; crumb?: ReactNode; children?: ReactNode; wide?: boolean }) {
  return (
    <section aria-labelledby="page-title" className="sky-band relative overflow-hidden">
      <div className="relative mx-auto max-w-[1360px] px-5 pb-16 pt-10 md:px-8 lg:px-12 lg:pb-24 lg:pt-16">
        <KiteMark className="ck-in pointer-events-none absolute right-8 top-10 hidden h-40 w-40 rotate-6 lg:block xl:right-16" />
        {crumb && <div className="mb-5 text-[0.95rem] font-bold text-white">{crumb}</div>}
        <h1 id="page-title" className={`display ck-in text-[2.4rem] ${wide ? "max-w-[22ch] sm:text-[3.25rem] lg:text-[4rem]" : "max-w-[14ch] sm:text-[4rem] lg:text-[4.75rem]"}`}>
          {title}
        </h1>
        {lede && (
          <p className="ck-in mt-6 max-w-[48ch] text-lg leading-relaxed text-white sm:text-xl" style={{ ["--d" as string]: "80ms" }}>
            {lede}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
