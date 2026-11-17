import { Cleaner } from "@/components/Cleaner";
import { HeroActions } from "@/components/HeroActions";
import { JsonLd } from "@/components/JsonLd";
import { Shield, SpecimenFigure } from "@/components/SpecimenFigure";
import { appUrl } from "@/lib/site";
import { freeProcessingLimits, softwareApplicationLd } from "@/server/plans";

const FEATURES = [
  {
    title: "Clean up the clutter",
    body: "Remove blank rows, duplicates, and extra spaces.",
    tint: "bg-mint-soft",
    icon: (
      <path d="M12 3 2.5 8 12 13l9.5-5zM2.5 12 12 17l9.5-5M2.5 16 12 21l9.5-5" />
    ),
  },
  {
    title: "Make formats consistent",
    body: "Standardize dates and turn currency into usable numbers.",
    tint: "bg-lemon-soft",
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
        <path d="M8 2.5v4M16 2.5v4M3 9.5h18" />
        <path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01M16.5 17h.01" strokeWidth="2.6" />
      </>
    ),
  },
  {
    title: "Review before you export",
    body: "See every change. Unclear dates are flagged for you.",
    tint: "bg-sky-soft",
    icon: (
      <>
        <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" />
        <circle cx="12" cy="12" r="3.5" />
      </>
    ),
  },
];

export default function Home() {
  return (
    <>
      <section className="mint-grid border-b-2 border-ink">
        <div className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-12 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:pb-14">
          <div>
            <p className="text-[15px] font-extrabold uppercase tracking-[0.04em] sm:text-[17px]">Less cleanup. More clarity.</p>
            <h1 className="display mt-4 text-[3.1rem] sm:text-[4.6rem] lg:text-[5.1rem]">
              Your shortcut <br />
              to a cleaner <br />
              spreadsheet.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] font-medium leading-snug sm:text-[21px]">
              Fix messy dates, duplicate rows, and formatting in one simple pass. Your files stay in your browser.
            </p>
            <HeroActions />
            <p className="mt-6 flex items-center gap-2.5 text-[15px] font-medium sm:text-[17px]">
              <Shield /> Private by design · No account required
            </p>
          </div>

          <SpecimenFigure />
        </div>
      </section>

      <div className="pt-8 sm:pt-10">
        <Cleaner freeLimits={freeProcessingLimits()} />
      </div>

      <section id="how-it-works" aria-labelledby="features-heading" className="mx-auto max-w-[1400px] scroll-mt-4 px-4 pb-16 sm:px-8">
        <h2 id="features-heading" className="display text-[2.2rem] sm:text-[3rem]">
          Clean data. Without the busywork.
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className={`card-pop flex items-start gap-4 p-5 sm:p-6 ${f.tint}`}>
              <svg className="mt-1 shrink-0" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {f.icon}
              </svg>
              <div>
                <h3 className="text-[21px] font-extrabold tracking-[-0.02em] sm:text-[23px]">{f.title}</h3>
                <p className="mt-1.5 text-[16px] font-medium leading-snug sm:text-[17px]">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <JsonLd data={softwareApplicationLd(appUrl())} />
    </>
  );
}
