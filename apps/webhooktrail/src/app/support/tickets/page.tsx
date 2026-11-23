import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TicketTable } from "@repo/support/ui";
import { getPlatform } from "@/lib/platform";

export const metadata: Metadata = { title: "Your support requests", robots: { index: false, follow: false } };

export default async function TicketsPage() {
  const p = await getPlatform();
  const { viewer, tickets } = await p.support.ticketsForViewer(new Headers(await headers()));
  if (viewer.kind === "anonymous") redirect(`/login?next=${encodeURIComponent("/support/tickets")}`);
  return (
    <div className="sup-root mx-auto w-full max-w-[860px] px-4 py-12">
      <p className="label">Support</p>
      <h1 className="mt-2 wt-h2 text-[30px] md:text-[34px]">Your support requests</h1>
      <p className="mt-2 text-fg-muted">
        {viewer.kind === "member" && viewer.seeAll
          ? "Requests opened by anyone in this workspace (you are an owner or admin)."
          : "Requests you opened in this workspace."}
      </p>
      <div className="mt-6">
        <TicketTable tickets={tickets} hrefFor={(t) => `/support/tickets/${t.id}`} />
      </div>
      <p className="mt-6">
        <Link href="/support#contact" className="text-signal underline">
          Open a new request
        </Link>
      </p>
    </div>
  );
}
