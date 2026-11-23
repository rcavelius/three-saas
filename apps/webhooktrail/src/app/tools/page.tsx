import type { Metadata } from "next";
import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";
import { TOOLS } from "@/content/tools";

export const metadata: Metadata = {
  title: "Webhook testing tools",
  description:
    "Free webhook tools: a webhook tester and request bin, Stripe, GitHub and Shopify webhook testers, mock responses, retry testing and signature debugging.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndex() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-14">
      <p className="label">Tools</p>
      <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em]">Webhook testing tools</h1>
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-fg-muted">
        Each page shows one job done with the same WebhookTrail endpoint: create one, point a sender at it and inspect what arrives. No account
        needed to start.
      </p>
      <div className="mt-6">
        <CreateEndpointButton />
      </div>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <li key={t.slug} className="border border-line rounded-[6px] bg-surface p-4">
            <h2 className="text-[17px] font-semibold">
              <Link className="hover:text-signal" href={`/tools/${t.slug}`}>
                {t.h1}
              </Link>
            </h2>
            <p className="mt-1 text-[14px] text-fg-muted">{t.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
