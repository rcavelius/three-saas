import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TicketTable } from "@repo/support/ui";
import { PageTitle } from "@/components/ui";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your support requests", robots: { index: false, follow: false } };

export default async function TicketsPage() {
  const p = await getPlatform();
  const { viewer, tickets } = await p.support.ticketsForViewer(await headers());
  if (viewer.kind === "anonymous") redirect(`/login?next=${encodeURIComponent("/support/tickets")}`);
  return (
    <div className="sup-root mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle
        eyebrow="Support"
        title="Your support requests"
        lede={
          viewer.kind === "member" && viewer.seeAll
            ? "Requests opened by anyone in this workspace (you are an owner or admin)."
            : "Requests you opened in this workspace."
        }
      />
      <div className="mt-8">
        <TicketTable tickets={tickets} hrefFor={(t) => `/support/tickets/${t.id}`} />
      </div>
      <p className="mt-8">
        <Link href="/support#contact" className="text-accent underline">
          Open a new request
        </Link>
      </p>
    </div>
  );
}
