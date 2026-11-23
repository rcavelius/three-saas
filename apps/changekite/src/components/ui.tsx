/** Small shared form/UI pieces in the report's visual language (paper, ink, one accent). */
import type { InputHTMLAttributes, ReactNode } from "react";
import { Star } from "./KiteMark";

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

export type Tone = "yellow" | "green" | "pink" | "cyan" | "orange";

const TONE_BG: Record<Tone, string> = {
  yellow: "bg-yellow",
  green: "bg-green",
  pink: "bg-pink",
  cyan: "bg-cyan",
  orange: "bg-orange",
};

/**
 * Opens marketing pages (tools, guides, docs, pricing): one big colour tile in the black frame, the same language as the
 * home bento. `art` is an optional 3D picture from /public/art; `children` sit under the lede.
 */
export function PageHero({
  title,
  lede,
  crumb,
  children,
  tone = "yellow",
  art,
  wide = false,
}: {
  title: string;
  lede?: ReactNode;
  crumb?: ReactNode;
  children?: ReactNode;
  tone?: Tone;
  art?: string;
  wide?: boolean;
}) {
  return (
    <section aria-labelledby="page-title" className="bg-ink px-2 pb-2">
      <div className={`tile ck-in mx-auto max-w-[1400px] px-6 pb-12 pt-9 text-ink sm:px-10 lg:px-14 lg:pb-16 lg:pt-14 ${TONE_BG[tone]}`}>
        {art && (
          <img
            src={art}
            alt=""
            width={360}
            height={360}
            className="ck-float pointer-events-none absolute -right-6 top-1/2 hidden h-64 w-auto -translate-y-1/2 lg:block xl:right-10 xl:h-72"
            style={{ ["--r" as string]: "-10deg" }}
          />
        )}
        <Star className="ck-twinkle absolute right-6 top-6 h-10 w-10 lg:hidden" fill="#fff" />
        {crumb && <div className="mb-4"><span className="chip">{crumb}</span></div>}
        <h1
          id="page-title"
          className={`display sticker text-[2.6rem] ${wide ? "max-w-[20ch] sm:text-[3.5rem] lg:text-[4.25rem]" : "max-w-[14ch] sm:text-[4.25rem] lg:text-[5.25rem]"}`}
          style={tone === "pink" ? { ["--sticker" as string]: "#fff" } : undefined}
        >
          {title}
        </h1>
        {lede && <p className="mt-5 max-w-[46ch] text-lg font-semibold leading-relaxed sm:text-xl">{lede}</p>}
        {children}
      </div>
    </section>
  );
}
