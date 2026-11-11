import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Notice, TicketForm } from "@repo/support/ui";
import { SupportChat } from "@repo/support/client";
import { PageTitle } from "@/components/ui";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Support",
  description: "Ask the ChangeKite help assistant or send a request to a person.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = await getPlatform();
  const viewer = await p.support.getViewer(await headers());
  const email = viewer.kind === "anonymous" ? null : viewer.user.email;
  return (
    <div className="sup-root mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle
        eyebrow="Support"
        title="How can we help?"
        lede="Ask the assistant: it answers from our help articles and cannot see or change your account. For refunds, disputes, security reports, legal or data requests, a person will handle your request."
      />
      {sp.sent === "1" && (
        <div className="mt-6">
          <Notice kind="success">Thanks, your request was sent.</Notice>
        </div>
      )}
      <section aria-labelledby="assistant" className="mt-10">
        <h2 id="assistant" className="font-display text-2xl font-semibold">
          Ask the assistant
        </h2>
        <div className="mt-4">
          <SupportChat assistantName="ChangeKite help" />
        </div>
        <p className="mt-3 text-sm text-muted">
          Prefer to browse? See the <Link href="/help" className="underline">help center</Link>.
        </p>
      </section>
      <section aria-labelledby="contact-heading" id="contact" className="mt-14 scroll-mt-8">
        <h2 id="contact-heading" className="font-display text-2xl font-semibold">
          Contact a person
        </h2>
        <p className="mt-2 text-ink-soft">
          We reply by email. {email ? <Link href="/support/tickets" className="text-accent underline">See your requests</Link> : "You will get a private link to follow your request."}
        </p>
        <div className="mt-6">
          <TicketForm signedInEmail={email} error={typeof sp.error === "string" ? sp.error : null} />
        </div>
      </section>
    </div>
  );
}
