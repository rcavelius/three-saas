/**
 * Pricing as three altitudes, rising left to right: the free scan on the ground, the one-time full report,
 * and monitoring high in the sky. Numbers come from the billing catalog. Actions are passed in, so /pricing
 * can use the real checkout buttons and the home page can link to /pricing.
 */
import type { ReactNode } from "react";
import type { PlanDef } from "@repo/billing";
import type { ReportOffer } from "@/lib/offer";
import { price } from "@/lib/marketing";
import { KiteMark } from "./SiteHeader";

function Tick({ light = false }: { light?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`mt-[0.3em] h-4 w-4 shrink-0 ${light ? "text-white" : "text-ink"}`}>
      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Points({ items, light = false }: { items: string[]; light?: boolean }) {
  return (
    <ul className={`mt-6 space-y-2.5 text-[1.0625rem] leading-snug ${light ? "text-white" : "text-ink"}`}>
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <Tick light={light} />
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
    <div className="grid items-end gap-3 lg:grid-cols-[1fr_1.05fr_1.9fr]">
      {/* Ground: the free scan. */}
      <section aria-labelledby="alt-free" className="ck-reveal flex flex-col rounded-[28px] bg-paper-deep p-7 sm:p-9 lg:min-h-[440px]">
        <H id="alt-free" className="text-xl font-extrabold">
          Free scan
        </H>
        <p className="display num mt-4 text-[4.5rem]">$0</p>
        <Points items={[`Up to ${offer.freePages} pages`, "Score and every check's result", `Top ${offer.freeIssues} issues with fixes`]} />
        <div className="mt-auto pt-8">{actions.free}</div>
      </section>

      {/* Mid air: the one-time full report. */}
      <section
        aria-labelledby="alt-pass"
        className="ck-reveal flex flex-col rounded-[28px] bg-sky-pale p-7 sm:p-9 lg:min-h-[540px]"
        style={{ ["--d" as string]: "90ms" }}
      >
        <H id="alt-pass" className="text-xl font-extrabold">
          Full report
        </H>
        <p className="mt-4 flex items-baseline gap-2">
          <span className="display num text-[4.5rem]">{offer.price}</span>
          <span className="text-lg font-bold">once</span>
        </p>
        <Points
          items={[
            "Every issue, where it is and how to fix it",
            `Scans of up to ${offer.pagesPerScan} pages`,
            offer.pdf ? "PDF export" : "",
            `Lasts ${offer.duration}; never renews`,
          ].filter(Boolean)}
        />
        <div className="mt-auto pt-8">{actions.pass}</div>
      </section>

      {/* High in the sky: monitoring plans. */}
      <section
        aria-labelledby="alt-watch"
        className="ck-reveal relative flex flex-col overflow-hidden rounded-[28px] bg-sky p-7 text-white sm:p-9 lg:min-h-[640px]"
        style={{ ["--d" as string]: "180ms" }}
      >
        <KiteMark className="absolute right-7 top-7 h-14 w-14 sm:right-9 sm:top-9" />
        <H id="alt-watch" className="text-xl font-extrabold">
          Monitoring
        </H>
        <p className="mt-2 max-w-[30ch] text-[1.0625rem] text-white">Scheduled re-scans, history, and an email only when something changes.</p>
        <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2">
          {plans.map((p) => (
            <div key={p.id} className="flex flex-col rounded-[22px] bg-white/12 p-6">
              <p className="text-lg font-extrabold">{p.name}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="display num text-[3.5rem]">{price(p)}</span>
                <span className="font-bold">/month</span>
              </p>
              <Points
                light
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
