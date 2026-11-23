/**
 * Pricing as three bento tiles: the free scan, the one-time full report (the gradient tile) and monitoring.
 * Numbers come from the billing catalog. Actions are passed in, so /pricing uses the real checkout buttons.
 */
import type { ReactNode } from "react";
import type { PlanDef } from "@repo/billing";
import type { ReportOffer } from "@/lib/offer";
import { price } from "@/lib/marketing";
import { Star } from "./KiteMark";

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-2.5 text-[1.0625rem] font-semibold leading-snug text-ink">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-[0.25em] h-4 w-4 shrink-0">
            <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export interface AltitudeActions {
  free: ReactNode;
  pass: ReactNode;
  plan: (p: PlanDef) => ReactNode;
}

export function Altitudes({ offer, plans, actions, headingLevel = "h3" }: { offer: ReportOffer; plans: PlanDef[]; actions: AltitudeActions; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr_1.9fr]">
      <section aria-labelledby="alt-free" className="tile ck-reveal flex flex-col bg-white p-7 sm:p-9">
        <span className="chip self-start">No account</span>
        <H id="alt-free" className="display mt-5 text-[1.75rem]">
          Free scan
        </H>
        <p className="display num mt-2 text-[5rem] leading-none">$0</p>
        <Points items={[`Up to ${offer.freePages} pages`, "Score and every check's result", `Top ${offer.freeIssues} issues with fixes`]} />
        <div className="mt-auto pt-8">{actions.free}</div>
      </section>

      <section
        aria-labelledby="alt-pass"
        className="tile ck-reveal flex flex-col bg-[linear-gradient(150deg,var(--color-pink),var(--color-orange))] p-7 sm:p-9"
        style={{ ["--d" as string]: "90ms" }}
      >
        <Star className="ck-twinkle absolute right-6 top-6 h-12 w-12" fill="var(--color-yellow)" />
        <span className="chip self-start">Charged once</span>
        <H id="alt-pass" className="display mt-5 text-[1.75rem]">
          Full report
        </H>
        <p className="display num sticker-white mt-2 text-[6rem] leading-none">{offer.price}</p>
        <Points
          items={["Every issue, where it is and how to fix it", `Scans of up to ${offer.pagesPerScan} pages`, offer.pdf ? "PDF export" : "", `Lasts ${offer.duration}; never renews`].filter(Boolean)}
        />
        <div className="mt-auto pt-8">{actions.pass}</div>
      </section>

      <section aria-labelledby="alt-watch" className="tile ck-reveal flex flex-col bg-green p-7 sm:p-9" style={{ ["--d" as string]: "180ms" }}>
        <img src="/art/bell.webp" alt="" width={319} height={360} loading="lazy" className="ck-float pointer-events-none absolute right-4 top-4 h-28 w-auto sm:h-32" style={{ ["--r" as string]: "12deg" }} />
        <span className="chip self-start">Monthly</span>
        <H id="alt-watch" className="display mt-5 text-[1.75rem]">
          Monitoring
        </H>
        <p className="mt-2 max-w-[30ch] text-[1.0625rem] font-semibold">Scheduled re-scans, history, and an email only when something changes.</p>
        <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2">
          {plans.map((p) => (
            <div key={p.id} className="flex flex-col rounded-[26px] bg-white p-6">
              <p className="display text-[1.5rem]">{p.name}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="display num text-[3.5rem] leading-none">{price(p)}</span>
                <span className="font-extrabold">/month</span>
              </p>
              <Points
                items={[
                  `${p.limits.sites} sites, ${p.limits.pagesPerScan!.toLocaleString("en-US")} pages each`,
                  `Re-scan every ${p.limits.scanFrequencyHours} hours`,
                  `${p.limits.teamSeats} seat${p.limits.teamSeats === 1 ? "" : "s"}, ${p.limits.historyDays} days of history`,
                ]}
              />
              <div className="mt-auto pt-7">{actions.plan(p)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
