import { EXAMPLE_HOST } from "@/lib/example-report";
import { FREE_LIMITS } from "@/lib/scanner/scan";
import { SevGlyph } from "./ExampleReport";

/**
 * Tool-page preview for link checks: the links part of a ChangeKite report, with labelled example data.
 * Severities follow the scanner's rules (check-docs: internal 4xx = critical, external 404/410 = warning,
 * internal link through a redirect = notice).
 */
const ROWS = [
  {
    s: "critical" as const,
    title: "Broken internal link to /order-now",
    status: "404",
    detail: `Found on https://${EXAMPLE_HOST}/menu`,
  },
  {
    s: "warning" as const,
    title: "External link no longer exists",
    status: "410",
    detail: "Found on /about, linking to an old supplier page",
  },
  {
    s: "notice" as const,
    title: "Internal link goes through a redirect",
    status: "301",
    detail: "/contact-us redirects to /contact; link to the final address",
  },
];

export function ExampleLinkCheck() {
  return (
    <figure
      className="ck-in mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl bg-white p-6 shadow-[0_0_0_1px_var(--color-rule),0_16px_48px_rgba(23,26,37,0.07)]"
      style={{ ["--d" as string]: "120ms" }}
      aria-label="Example link-check results with illustrative data"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-lg font-extrabold tracking-[-0.02em]">Example link-check results</p>
        <span className="rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-bold text-accent">Illustrative data</span>
      </div>
      <p className="mt-1 text-[13.5px] text-muted">{EXAMPLE_HOST} · internal and external links</p>
      <ul className="mt-4">
        {ROWS.map((r) => (
          <li key={r.title} className="flex gap-3 border-t border-rule py-3.5">
            <SevGlyph s={r.s} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline justify-between gap-3 text-sm font-bold text-ink">
                {r.title}
                <span className="num shrink-0 rounded bg-paper px-1.5 text-xs font-extrabold text-ink-soft">{r.status}</span>
              </p>
              <p className="mt-0.5 text-[13.5px] leading-[1.45] text-muted [overflow-wrap:anywhere]">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="border-t border-rule pt-3.5 text-[13px] leading-[1.5] text-ink-soft">
        The free scan checks the internal links on the pages it reads and up to {FREE_LIMITS.maxExternalLinks} external links, and runs the other checks too. Each finding comes with how to fix it.
      </figcaption>
    </figure>
  );
}
