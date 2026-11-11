import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Notice, TicketForm } from "@repo/support/ui";
import { SupportChat } from "@repo/support/client";
import { getPlatform } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Support",
  description: "Ask the HookPilot help assistant or send a request to a person.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = await getPlatform();
  const viewer = await p.support.getViewer(new Headers(await headers()));
  const email = viewer.kind === "anonymous" ? null : viewer.user.email;
  return (
    <div className="sup-root mx-auto w-full max-w-[860px] px-4 py-12">
      <p className="label">Support</p>
      <h1 className="mt-2 text-[26px] font-semibold">How can we help?</h1>
      <p className="mt-2 max-w-[70ch] text-fg-muted">
        The assistant answers from our help articles and cannot see or change your account or your captured requests. Refunds, disputes,
        security reports, legal and data requests are handled by a person.
      </p>
      {sp.sent === "1" && (
        <div className="mt-6">
          <Notice kind="success">Thanks, your request was sent.</Notice>
        </div>
      )}
      <section aria-labelledby="assistant" className="mt-8">
        <h2 id="assistant" className="text-[18px] font-semibold">
          Ask the assistant
        </h2>
        <div className="mt-3">
          <SupportChat assistantName="HookPilot help" />
        </div>
        <p className="mt-2 text-[13px] text-fg-dim">
          Prefer to browse? See the{" "}
          <Link href="/help" className="underline hover:text-fg">
            help center
          </Link>{" "}
          or the{" "}
          <Link href="/docs" className="underline hover:text-fg">
            docs
          </Link>
          .
        </p>
      </section>
      <section aria-labelledby="contact-heading" id="contact" className="mt-12 scroll-mt-6">
        <h2 id="contact-heading" className="text-[18px] font-semibold">
          Contact a person
        </h2>
        <p className="mt-1 text-fg-muted">
          We reply by email.{" "}
          {email ? (
            <Link href="/support/tickets" className="text-signal underline">
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
