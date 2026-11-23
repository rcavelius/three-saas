import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { headers } from "next/headers";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { Notice, TicketForm } from "@repo/support/ui";
import { SupportChat } from "@repo/support/client";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({
  title: "Support",
  description: "Ask the GridRinse help assistant or send a request to a person.",
  path: "/support",
});

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = await getPlatform();
  const viewer = await p.support.getViewer(new Headers(await headers()));
  const email = viewer.kind === "anonymous" ? null : viewer.user.email;
  return (
    <div className="sup-root">
      <PageHero narrow eyebrow="Support" title="How can we help?">
      <p>
        The assistant answers from our help articles and cannot see or change your account (and never sees your files: they stay in your
        browser). Refunds, disputes, security reports, legal and data requests are handled by a person.
      </p>
      </PageHero>
      <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-8 sm:py-14">
      {sp.sent === "1" && (
        <div className="mt-6">
          <Notice kind="success">Thanks, your request was sent.</Notice>
        </div>
      )}
      <section aria-labelledby="assistant" className="mt-8">
        <h2 id="assistant" className="text-[1.8rem] font-extrabold tracking-[-0.02em]">
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
        <h2 id="contact-heading" className="text-[1.8rem] font-extrabold tracking-[-0.02em]">
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
    </div>
  );
}
