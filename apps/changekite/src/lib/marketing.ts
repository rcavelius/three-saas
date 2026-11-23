/** Pricing copy and structured data derived from the billing catalog (single source of truth for numbers). */
import { CHANGEKITE_CATALOG, type PlanDef } from "@repo/billing";

export function planFeatures(p: PlanDef): string[] {
  const l = p.limits;
  const f = p.features;
  if (p.id === CHANGEKITE_CATALOG.freePlanId) {
    return [`One-off scans, no account needed`, `Up to ${l.pagesPerScan} pages per scan`, "Shareable report link", "Print to PDF from the browser"];
  }
  return [
    `${l.sites} monitored site${l.sites === 1 ? "" : "s"}`,
    `Up to ${l.pagesPerScan!.toLocaleString("en-US")} pages per scan`,
    `Automatic re-scan every ${l.scanFrequencyHours} hours`,
    f.emailAlerts ? "Email alerts only when something changes" : "",
    `${l.historyDays} days of report history`,
    `${l.teamSeats} team seat${l.teamSeats === 1 ? "" : "s"}`,
    f.pdfReports ? "Client-ready PDF reports" : "",
    f.priorityQueue ? "Priority scan queue" : "",
  ].filter(Boolean);
}

export function price(p: PlanDef): string {
  return `$${(p.priceMonthlyCents / 100).toFixed(p.priceMonthlyCents % 100 ? 2 : 0)}`;
}

export function softwareApplicationJsonLd(appUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ChangeKite",
    applicationCategory: "WebApplication",
    operatingSystem: "Any (web browser)",
    url: appUrl,
    description:
      "Website inspection and monitoring: broken links, titles, meta descriptions, canonicals, image alt text, sitemap, robots.txt, HTTPS and certificate checks.",
    offers: CHANGEKITE_CATALOG.plans.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: (p.priceMonthlyCents / 100).toFixed(2),
      priceCurrency: "USD",
      ...(p.priceMonthlyCents > 0
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: (p.priceMonthlyCents / 100).toFixed(2), priceCurrency: "USD", unitText: "MONTH" } }
        : {}),
      url: `${appUrl}/pricing`,
    })),
  };
}

export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "How does billing work?",
    a: "Paid plans are billed monthly in US dollars through Stripe, starting the day you subscribe. Stripe handles your card details; ChangeKite never sees or stores them. Taxes may apply where required.",
  },
  {
    q: "Can I cancel or change plans?",
    a: "Yes, at any time from Plan & billing. Upgrades apply immediately (the difference is prorated on the next invoice). A cancellation or downgrade keeps your current plan until the end of the period you paid for; after that the workspace moves to the free plan and monitored sites above the new limit are paused, not deleted.",
  },
  {
    q: "Do you offer refunds?",
    a: "Yes. If you were charged in error, or ChangeKite did not work for you in your first 14 days on a paid plan, email support within 14 days of the charge and we refund it in full. Other requests are reviewed by a person.",
  },
  {
    q: "How long do you keep my data?",
    a: "Free report links expire after 90 days. Monitoring history is kept for the number of days your plan includes; the latest scan of each site is always kept while the site is monitored. Deleting your account removes your workspace, sites, history and alerts immediately.",
  },
  {
    q: "Is it safe to point ChangeKite at my site?",
    a: "ChangeKite only reads public pages with GET and HEAD requests, identifies itself as ChangeKiteBot, obeys robots.txt, pauses between requests and limits how often any one site is scanned, across all customers. It never submits forms, logs in or runs your JavaScript.",
  },
  {
    q: "Who can see my reports?",
    a: "Reports of monitored sites are visible only to members of your workspace. Free one-off reports are private links with an unguessable address; anyone you share the link with can open them.",
  },
];

export function faqJsonLd(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
