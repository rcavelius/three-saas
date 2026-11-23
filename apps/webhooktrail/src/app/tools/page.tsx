import type { Metadata } from "next";
import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { TOOLS, type ToolPage } from "@/content/tools";

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
    slugs: ["stripe-webhook-tester", "github-webhook-tester", "shopify-webhook-tester", "twilio-webhook-tester", "slack-webhook-tester"],
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
    <li>
      <Link
        href={`/tools/${t.slug}`}
        className="group flex h-full min-h-[156px] flex-col rounded-[12px] border border-line bg-surface p-6 transition-colors duration-[120ms] hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-[18px] font-semibold leading-6 tracking-[-0.02em] group-hover:text-signal">{t.h1}</span>
          <span className="flex shrink-0 items-center gap-2">
            {PAID.has(t.slug) && <span className="label rounded border border-line-strong px-1.5 py-0.5 !text-[10px]">Paid plans</span>}
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 text-fg-dim transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-signal" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        </span>
        <span className="mt-2 text-[15px] leading-[23px] text-fg-muted">{t.description}</span>
      </Link>
    </li>
  );
}

export default function ToolsIndex() {
  const bySlug = new Map(TOOLS.map((t) => [t.slug, t]));
  const grouped = new Set(GROUPS.flatMap((g) => g.slugs));
  const rest = TOOLS.filter((t) => !grouped.has(t.slug));
  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-8 md:py-16">
      <p className="label">Tools</p>
      <h1 className="mt-4 wt-display text-[36px] md:text-[52px]">Webhook testing tools</h1>
      <p className="mt-3 max-w-[62ch] text-[16px] leading-[26px] text-fg-muted">
        Every tool here is the same WebhookTrail endpoint used for one job: create one, point a sender at it and inspect what arrives. No account
        needed to start.
      </p>

      <section aria-labelledby="start" className="mt-10 grid gap-6 rounded-[14px] border border-line-strong bg-surface-2 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
        <div>
          <p className="label !text-signal">Start here / capture</p>
          <h2 id="start" className="mt-3 wt-h2 text-[26px] md:text-[32px]">
            See the next request that hits your endpoint.
          </h2>
          <p className="mt-2 text-[16px] leading-[26px] text-fg-muted">Create a private URL, send a request to it, and inspect what arrived.</p>
        </div>
        <CreateEndpointButton />
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} aria-labelledby={`grp-${g.slugs[0]}`} className="mt-14">
          <h2 id={`grp-${g.slugs[0]}`} className="wt-h2 text-[24px] md:text-[28px]">
            {g.title}
          </h2>
          <p className="mt-1 text-[15px] text-fg-dim">{g.line}</p>
          <ul className={`mt-6 grid gap-4 sm:grid-cols-2 ${g.cols === 2 ? "" : "lg:grid-cols-3"}`}>
            {g.slugs
              .map((s) => bySlug.get(s))
              .filter((t): t is ToolPage => Boolean(t))
              .map((t) => (
                <ToolCard key={t.slug} t={t} />
              ))}
          </ul>
        </section>
      ))}
      {rest.length > 0 && (
        <section aria-labelledby="grp-more" className="mt-14">
          <h2 id="grp-more" className="wt-h2 text-[24px] md:text-[28px]">
            More
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((t) => (
              <ToolCard key={t.slug} t={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
