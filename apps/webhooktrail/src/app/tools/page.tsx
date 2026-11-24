import type { Metadata } from "next";
import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { TOOLS, type ToolPage } from "@/content/tools";
import { PageHead } from "@/components/grid/PageHead";

export const metadata: Metadata = {
  title: "Webhook testing tools",
  description:
    "Free webhook tools: a webhook tester and request bin, Stripe, GitHub and Shopify webhook testers, mock responses, retry testing and signature debugging.",
  alternates: { canonical: "/tools" },
};

/** Tool pages grouped by what a developer is trying to do. Every slug must exist in content/tools.ts. */
const GROUPS: { title: string; line: string; slugs: string[]; cols?: 2 }[] = [
  {
    title: "Capture & inspect",
    line: "Get a URL, send something to it, read exactly what arrived.",
    slugs: ["webhook-tester", "request-bin", "send-test-webhook"],
  },
  {
    title: "Provider testing",
    line: "The same capture URL, with the steps for each provider's dashboard and headers.",
    slugs: ["stripe-webhook-tester", "github-webhook-tester", "shopify-webhook-tester", "twilio-webhook-tester", "slack-webhook-tester", "paypal-webhook-tester", "sendgrid-webhook-tester"],
  },
  {
    title: "Responses, replay & diagnostics",
    line: "Control what the URL answers, watch retries, debug signatures, re-send captured requests.",
    slugs: ["mock-webhook-response", "test-webhook-retries", "verify-webhook-signature", "replay-webhook"],
    cols: 2,
  },
];

const PAID = new Set(["replay-webhook"]);

function ToolCard({ t }: { t: ToolPage }) {
  return (
    <li className="g-x">
      <Link href={`/tools/${t.slug}`} className="g-link group flex h-full min-h-[150px] flex-col p-4 md:p-6">
        <span className="flex items-start justify-between gap-3">
          <span className="text-[15px] font-bold uppercase leading-[21px] tracking-[0.02em]">{t.h1}</span>
          <span className="flex shrink-0 items-center gap-2">
            {PAID.has(t.slug) && <span className="g-cap border border-current px-1.5 py-0.5 !text-[10px]">Paid plans</span>}
            <span aria-hidden="true" className="arr">→</span>
          </span>
        </span>
        <span className="g-mute g-read mt-3 text-[14px] leading-[22px] text-fg-muted">{t.description}</span>
      </Link>
    </li>
  );
}

export default function ToolsIndex() {
  const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
  const grouped = new Set(GROUPS.flatMap((g) => g.slugs));
  const rest = TOOLS.filter((t) => !grouped.has(t.slug));
  return (
    <div className="g-frame">
      <PageHead
        word="Webhook tools"
        art="packet"
        lead={
          <>
            <p className="font-mono text-[15px] text-fg md:text-[17px]">One endpoint. One job each.</p>
            <p className="mt-3">Create a URL, point a sender at it and inspect what arrives. No account needed.</p>
            <div className="mt-5">
              <CreateEndpointButton />
            </div>
          </>
        }
      />

      {[...GROUPS, ...(rest.length ? [{ title: "More", line: "", slugs: rest.map((t) => t.slug) }] : [])].map((g) => (
        <section key={g.title} aria-labelledby={`grp-${g.slugs[0]}`} className="mt-12 border-t border-line md:mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line px-4 py-4 md:px-5">
            <h2 id={`grp-${g.slugs[0]}`} className="font-[family-name:var(--font-pixel)] text-[26px] font-bold uppercase leading-none md:text-[34px]">
              {g.title}
            </h2>
            {g.line && <p className="font-mono text-[12.5px] text-fg-dim">{g.line}</p>}
          </div>
          <ul className="g-row grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {g.slugs
              .map((s) => bySlug.get(s))
              .filter((t): t is ToolPage => Boolean(t))
              .map((t) => (
                <ToolCard key={t.slug} t={t} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
