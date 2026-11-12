import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { PlanButton } from "@/components/PlanButton";
import { formatLimit } from "@/lib/limits";
import { appUrl } from "@/lib/site";
import { displayPlans, softwareApplicationLd, type DisplayPlan } from "@/server/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "GridRinse is free in your browser. Pro and Business add larger files, bigger batches, workflows saved to your account and team seats.",
  alternates: { canonical: "/pricing" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do paid plans upload my files?",
    a: "No. On every plan your files are read, cleaned and exported inside your browser. An account stores your email, your saved workflows (the list of steps, not your data) and your billing status. Our site's Content-Security-Policy blocks the page from sending data to any other server.",
  },
  {
    q: "How does billing work?",
    a: "Plans are billed monthly in US dollars through Stripe. You can switch plans or update your card from the billing page; changes take effect immediately and Stripe prorates the difference.",
  },
  {
    q: "How do I cancel?",
    a: "Open Account → Billing → Manage billing and cancel. Your plan stays active until the end of the period you paid for, then your account moves to the free plan. Workflows above the free limit are kept read-only, not deleted.",
  },
  {
    q: "Can I get a refund?",
    a: "Contact support. Refund requests are handled by a person, case by case.",
  },
  {
    q: "What data do you keep, and for how long?",
    a: "Your account details, team memberships, saved workflows and billing records, for as long as the account exists. Deleting your account removes your workspace and its saved workflows immediately. Spreadsheet contents are never stored because we never receive them.",
  },
  {
    q: "Are the plan limits enforced on your servers?",
    a: "File size, rows and files per batch apply to processing in your own browser, so they are plan limits rather than security boundaries. Saved workflows and team seats are stored by us and are enforced on our servers.",
  },
  {
    q: "Is it secure?",
    a: "Passwords are hashed, sessions use secure http-only cookies, every request for saved workflows is checked against your workspace, and the site sends strict security headers. Payments are handled by Stripe; we never see card numbers.",
  },
];

const ROWS: [string, (p: DisplayPlan) => string][] = [
  ["File size", (p) => (p.limits.maxFileMb! < 0 ? "Unlimited" : `${p.limits.maxFileMb} MB`)],
  ["Rows per file", (p) => formatLimit(p.limits.maxRows!)],
  ["Files per batch", (p) => formatLimit(p.limits.filesPerBatch!)],
  ["Workflows in your account", (p) => (p.limits.savedWorkflows === 0 ? "—" : formatLimit(p.limits.savedWorkflows!))],
  ["Team seats", (p) => formatLimit(p.limits.teamSeats!)],
];

export default function Pricing() {
  const plans = displayPlans();
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Pricing</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Free in your browser. Paid plans for bigger jobs.</h1>
      <p className="mt-3 max-w-[62ch] text-ink-2">
        The cleaner is free and needs no account. Pro and Business raise the file and batch limits, save workflows to your account and add team seats. Every plan processes files
        in your browser; nothing is uploaded.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse border border-rule bg-surface text-sm">
          <caption className="sr-only">Plans and limits</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[22%] border-b border-r border-rule bg-sunken px-4 py-3 text-left text-xs font-semibold text-ink-2">
                Plan
              </th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className={`border-b border-r border-rule px-4 py-3 text-left align-top ${p.id === "pro" ? "bg-accent-wash" : "bg-sunken"}`}>
                  <span className="block text-base font-semibold">{p.name}</span>
                  <span className="mt-1 block font-mono text-2xl font-medium">
                    ${p.priceMonthly}
                    <span className="text-sm text-ink-3">/mo</span>
                  </span>
                  <span className="mt-1 block text-xs font-normal text-ink-2">{p.blurb}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {ROWS.map(([label, fn]) => (
              <tr key={label}>
                <th scope="row" className="border-b border-r border-rule px-4 py-2 text-left font-sans text-xs font-semibold text-ink-2">
                  {label}
                </th>
                {plans.map((p) => (
                  <td key={p.id} className="border-b border-r border-rule px-4 py-2 tabular-nums">
                    {fn(p)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="border-b border-r border-rule px-4 py-2 text-left align-top font-sans text-xs font-semibold text-ink-2">
                Includes
              </th>
              {plans.map((p) => (
                <td key={p.id} className="border-b border-r border-rule px-4 py-2 align-top font-sans text-[13px] text-ink-2">
                  <ul className="space-y-1">
                    {p.highlights.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-r border-rule px-4 py-3" />
              {plans.map((p) => (
                <td key={p.id} className="border-r border-rule px-4 py-3 align-top font-sans">
                  <PlanButton planId={p.id} planName={p.name} primary={p.id === "pro"} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] text-ink-3">
        Prices in US dollars per month, billed through Stripe. File size, rows and batch limits apply to processing in your browser; saved workflows and seats are enforced by our
        servers.
      </p>

      <section aria-labelledby="faq-heading" className="mt-12 max-w-[760px]">
        <h2 id="faq-heading" className="text-xl font-semibold">
          Questions
        </h2>
        <dl className="mt-4 divide-y divide-rule border-y border-rule">
          {FAQ.map((f) => (
            <div key={f.q} className="py-4">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <JsonLd data={softwareApplicationLd(appUrl())} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
    </div>
  );
}
