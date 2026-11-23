import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PassButton } from "@/components/PassPaywall";
import { PlanButton } from "@/components/PlanButton";
import { formatLimit } from "@/lib/limits";
import { appUrl } from "@/lib/site";
import { displayPlans, passOffer, softwareApplicationLd, type DisplayPlan } from "@/server/plans";

export const metadata: Metadata = pageMeta({
  title: "Pricing",
  description:
    "Clean and preview CSV and Excel files free in your browser, with one free download a day of up to 1,000 rows. A 24-hour pass ($5, one-time) or Pro ($9/month) unlocks bigger files and unlimited downloads.",
  path: "/pricing",
});

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need an account to try it?",
    a: "No. The free plan works right away in your browser, with no sign-up. The 24-hour pass needs no account either. An account is only needed for Pro or Business.",
  },
  {
    q: "What is free, exactly?",
    a: "Previewing and cleaning any file up to 5 MB and 50,000 rows, with every cleaning step. Downloading the cleaned file is free once a day when it has up to 1,000 rows. The built-in sample files can always be downloaded. Larger downloads need a 24-hour pass or a paid plan.",
  },
  {
    q: "What is the 24-hour pass?",
    a: "A one-time payment of $5 that gives this browser Pro's file limits (files up to 50 MB, 500,000 rows, 20 files at once) and unlimited downloads for 24 hours from the moment you pay. No account and no subscription. Your files are still processed in your browser and never uploaded.",
  },
  {
    q: "Does the pass renew?",
    a: "No. It is charged once and never renews. When the 24 hours are over, the browser is back on the free plan and nothing else is charged.",
  },
  {
    q: "Can I use my pass on another device?",
    a: "Yes. While the pass is active, the cleaner shows a private unlock link; open it in another browser to unlock that one too. If you are signed in when you buy, the pass also counts for your workspace.",
  },
  {
    q: "Can I get a refund for a pass?",
    a: "If a pass did not unlock what this page describes, email support@gridrinse.com within 7 days of purchase for a full refund; a refunded pass stops working.",
  },
  {
    q: "Are my files uploaded?",
    a: "No. On every plan your files are read, cleaned and exported inside your browser. An account stores your email, your saved workflows (the list of steps, not your data) and your billing status. Our site's Content-Security-Policy blocks the page from sending data to any other server.",
  },
  {
    q: "Which file types can I use?",
    a: "CSV and TSV files, Excel workbooks (.xlsx, .xlsm, .xls) and OpenDocument spreadsheets (.ods). You can download the cleaned result as CSV, TSV or Excel.",
  },
  {
    q: "What happens to ambiguous dates?",
    a: "If a column could be read two ways (03/04/2024 is 3 April in the UK and March 4 in the US), GridRinse leaves it unchanged and asks you to choose day-first or month-first. It never guesses.",
  },
  {
    q: "How does billing work?",
    a: "Plans are billed monthly in US dollars through Stripe; the 24-hour pass is a single payment. Sales tax is added at checkout only where it applies to your billing address, and checkout shows it before you pay. You can switch plans or update your card from the billing page; changes take effect immediately and Stripe prorates the difference.",
  },
  {
    q: "How do I cancel?",
    a: "Open Account → Billing → Manage billing and cancel. Your plan stays active until the end of the period you paid for, then your account moves to the free plan. Workflows above the free limit are kept read-only, not deleted.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes. If you were charged in error, or GridRinse did not work for you in your first 14 days on a paid plan, email support@gridrinse.com within 14 days of the charge and we refund it in full. Other requests are reviewed by a person.",
  },
  {
    q: "What data do you keep, and for how long?",
    a: "Your account details, team memberships, saved workflows and billing records, for as long as the account exists. Deleting your account removes your workspace and its saved workflows immediately. Spreadsheet contents are never stored because we never receive them.",
  },
  {
    q: "Are the plan limits enforced on your servers?",
    a: "File size, rows, files per batch and the free download allowance apply to processing in your own browser (free downloads are counted in this browser), so they are plan limits rather than security boundaries. Saved workflows and team seats are stored by us and are enforced on our servers.",
  },
  {
    q: "Is it secure?",
    a: "Passwords are hashed, sessions use secure http-only cookies, every request for saved workflows is checked against your workspace, and the site sends strict security headers. Payments are handled by Stripe; we never see card numbers.",
  },
];

const fmtMb = (mb: number) => (mb < 0 ? "Unlimited" : `${mb.toLocaleString("en-US")} MB`);

function planFeatures(p: DisplayPlan): string[] {
  const l = p.limits;
  const out = [
    `${formatLimit(l.filesPerBatch!)} files at once`,
    `Up to ${fmtMb(l.maxFileMb!)} per file`,
    `Up to ${formatLimit(l.maxRows!)} rows per file`,
  ];
  if (p.id === "free") {
    const rows = l.downloadRows ?? -1;
    const perDay = l.downloadsPerDay ?? -1;
    const dl = rows < 0 && perDay < 0 ? "Unlimited downloads" : `${perDay === 1 ? "One cleaned download a day" : `${formatLimit(perDay)} cleaned downloads a day`}, up to ${formatLimit(rows)} rows`;
    return [...out, "Preview every change before downloading", dl, "CSV and Excel support", "Files stay on your device"];
  }
  if ((l.downloadRows ?? -1) < 0 && (l.downloadsPerDay ?? -1) < 0) out.push("Unlimited downloads");
  out.push(l.savedWorkflows! < 0 ? "Unlimited workflows saved to your account" : `${formatLimit(l.savedWorkflows!)} workflows saved to your account`);
  if (p.features.sharedTeamWorkflows) out.push(`Shared team workflows, ${formatLimit(l.teamSeats!)} seats`);
  if (p.features.prioritySupport) out.push("Priority email support");
  return [...out, "Everything in Free"];
}

function Tick() {
  return (
    <svg className="mt-0.5 shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-ok)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-2.5 text-[17px] font-medium">
      {items.map((f) => (
        <li key={f} className="flex gap-3">
          <Tick />
          {f}
        </li>
      ))}
    </ul>
  );
}

export default function Pricing() {
  const plans = displayPlans();
  const free = plans.find((p) => p.id === "free")!;
  const pro = plans.find((p) => p.id === "pro")!;
  const business = plans.find((p) => p.id === "business");
  const pass = passOffer();
  return (
    <>
      <section className="mint-grid border-b-2 border-ink">
        <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-10 text-center sm:px-8 sm:pb-12 sm:pt-12">
          <h1 className="display text-[3rem] sm:text-[4.4rem] lg:text-[5rem]">
            Clean data. <br />
            Simple pricing.
          </h1>
          <p className="mx-auto mt-4 max-w-[44rem] text-[18px] font-medium sm:text-[21px]">
            Start free. Take a 24-hour pass for a one-off job. Choose Pro when spreadsheet cleanup becomes part of your routine.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-8 sm:py-14">
        <div className={`grid items-start gap-8 ${pass ? "lg:grid-cols-3 lg:gap-6" : "md:grid-cols-2 md:gap-10"}`}>
          <section aria-labelledby="plan-free" className="rounded-[12px] border-2 border-ink bg-surface px-6 py-7 sm:px-8 md:mt-4">
            <h2 id="plan-free" className="text-[2.2rem] font-extrabold tracking-[-0.03em]">
              {free.name}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="display text-[4rem]">${free.priceMonthly}</span>
              <span className="rounded-md bg-sunken px-3 py-1.5 text-[15px] font-bold">No account required</span>
            </p>
            <p className="mt-2 text-[17px] font-medium">For a quick spreadsheet cleanup.</p>
            <div className="mt-6">
              <PlanButton planId={free.id} planName={free.name} primary label="Start cleaning free" />
            </div>
            <FeatureList items={planFeatures(free)} />
          </section>

          {pass && (
            <section aria-labelledby="plan-pass" className="rounded-[12px] border-2 border-ink bg-lemon-soft px-6 py-7 sm:px-8 md:mt-4">
              <h2 id="plan-pass" className="text-[2.2rem] font-extrabold tracking-[-0.03em]">
                {pass.name.charAt(0).toUpperCase() + pass.name.slice(1)}
              </h2>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="display text-[4rem]">${pass.price}</span>
                <span className="text-[19px] font-bold">once</span>
              </p>
              <p className="mt-2 text-[17px] font-medium">One-time, no subscription, no account needed.</p>
              <div className="mt-6 flex flex-col gap-2">
                <PassButton pass={pass} from="pricing" returnPath="/" className="btn-pop w-full" />
              </div>
              <FeatureList
                items={[
                  `${formatLimit(pass.maxFiles)} files at once`,
                  `Up to ${fmtMb(Math.round(pass.maxFileBytes / (1024 * 1024)))} per file`,
                  `Up to ${formatLimit(pass.maxRows)} rows per file`,
                  "Unlimited downloads",
                  `For ${pass.durationHours} hours from payment, in this browser`,
                  "Never renews",
                ]}
              />
            </section>
          )}

          <section aria-labelledby="plan-pro" className="card-pop overflow-hidden">
            <p className="border-b-2 border-ink bg-mint px-6 py-2.5 text-[17px] font-extrabold uppercase tracking-[0.02em] sm:px-8">For regular cleanup</p>
            <div className="px-6 pb-7 pt-5 sm:px-8">
              <h2 id="plan-pro" className="text-[2.2rem] font-extrabold tracking-[-0.03em]">
                {pro.name}
              </h2>
              <p className="mt-1 flex items-baseline gap-3">
                <span className="display text-[4rem]">${pro.priceMonthly}</span>
                <span className="text-[19px] font-bold">/ month</span>
              </p>
              <p className="mt-2 text-[17px] font-medium">For people who work with spreadsheets regularly.</p>
              <div className="mt-6">
                <PlanButton planId={pro.id} planName={pro.name} primary label="Get Pro" />
              </div>
              <FeatureList items={planFeatures(pro)} />
              <p className="mt-6 border-t-2 border-rule pt-4 text-center text-[15px] font-medium text-ink-2">Billed monthly through Stripe. Cancel any time.</p>
            </div>
          </section>
        </div>

        {business && (
          <section aria-labelledby="plan-business" className="mt-10 flex flex-col gap-5 rounded-[12px] border-2 border-ink bg-sky-soft px-6 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-10">
            <div className="lg:w-56 lg:shrink-0">
              <h2 id="plan-business" className="text-[1.8rem] font-extrabold tracking-[-0.02em]">
                {business.name}
              </h2>
              <p className="flex items-baseline gap-2">
                <span className="display text-[2.6rem]">${business.priceMonthly}</span>
                <span className="text-[17px] font-bold">/ month</span>
              </p>
            </div>
            <p className="flex-1 text-[17px] font-medium">
              {business.blurb} {planFeatures(business).slice(0, -1).join(" · ")}.
            </p>
            <div className="lg:w-56 lg:shrink-0">
              <PlanButton planId={business.id} planName={business.name} />
            </div>
          </section>
        )}

        <p className="mt-10 flex items-center justify-center gap-3 rounded-[12px] border-2 border-ink bg-lemon px-5 py-4 text-center text-[18px] font-extrabold sm:text-[21px]">
          <svg className="shrink-0" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z" />
          </svg>
          Your files are processed locally on every plan.
        </p>

        <section aria-labelledby="faq-heading" className="mt-14">
          <h2 id="faq-heading" className="display text-[2.2rem] sm:text-[2.8rem]">
            Frequently asked questions
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0} className="group rounded-[10px] border-2 border-ink bg-surface open:bg-mint-soft">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-[19px] font-extrabold tracking-[-0.01em] sm:px-6 sm:text-[21px] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg className="shrink-0 transition-transform group-open:rotate-180" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="px-5 pb-4 text-[17px] font-medium leading-relaxed sm:px-6">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
      <JsonLd data={softwareApplicationLd(appUrl())} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
    </>
  );
}
