import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Notice, TicketForm } from "@repo/support/ui";
import { SupportChat } from "@repo/support/client";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Support",
  description: "Ask the GridRinse help assistant or send a request to a person.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = await getPlatform();
  const viewer = await p.support.getViewer(new Headers(await headers()));
  const email = viewer.kind === "anonymous" ? null : viewer.user.email;
  return (
    <div className="sup-root mx-auto max-w-[900px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Support</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">How can we help?</h1>
      <p className="mt-3 max-w-[65ch] text-ink-2">
        The assistant answers from our help articles and cannot see or change your account (and never sees your files: they stay in your
        browser). Refunds, disputes, security reports, legal and data requests are handled by a person.
      </p>
      {sp.sent === "1" && (
        <div className="mt-6">
          <Notice kind="success">Thanks, your request was sent.</Notice>
        </div>
      )}
      <section aria-labelledby="assistant" className="mt-8">
        <h2 id="assistant" className="text-lg font-semibold">
          Ask the assistant
        </h2>
        <div className="mt-3">
          <SupportChat assistantName="GridRinse help" />
        </div>
        <p className="mt-2 text-sm text-ink-3">
          Prefer to browse? See the{" "}
          <Link href="/help" className="underline">
            help center
          </Link>
          .
        </p>
      </section>
      <section aria-labelledby="contact-heading" id="contact" className="mt-12 scroll-mt-6">
        <h2 id="contact-heading" className="text-lg font-semibold">
          Contact a person
        </h2>
        <p className="mt-1 text-ink-2">
          We reply by email.{" "}
          {email ? (
            <Link href="/support/tickets" className="text-accent underline">
              See your requests
            </Link>
          ) : (
            "You will get a private link to follow your request."
          )}
        </p>
        <div className="mt-4 max-w-[640px]">
          <TicketForm signedInEmail={email} error={typeof sp.error === "string" ? sp.error : null} />
        </div>
      </section>
    </div>
  );
}
