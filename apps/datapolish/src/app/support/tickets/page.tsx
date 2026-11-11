import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TicketTable } from "@repo/support/ui";
import { getPlatform } from "@/server/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your support requests", robots: { index: false, follow: false } };

export default async function TicketsPage() {
  const p = await getPlatform();
  const { viewer, tickets } = await p.support.ticketsForViewer(new Headers(await headers()));
  if (viewer.kind === "anonymous") redirect(`/login?next=${encodeURIComponent("/support/tickets")}`);
  return (
    <div className="sup-root mx-auto max-w-[900px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Support</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your support requests</h1>
      <p className="mt-3 text-ink-2">
        {viewer.kind === "member" && viewer.seeAll
          ? "Requests opened by anyone in this workspace (you are an owner or admin)."
          : "Requests you opened in this workspace."}
      </p>
      <div className="mt-6">
        <TicketTable tickets={tickets} hrefFor={(t) => `/support/tickets/${t.id}`} />
      </div>
      <p className="mt-6">
        <Link href="/support#contact" className="text-accent underline">
          Open a new request
        </Link>
      </p>
    </div>
  );
}
