import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS } from "@repo/support";
import { CustomerTicketActions, Notice, StatusBadge, TicketThread } from "@repo/support/ui";
import { getPlatform } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support request", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TicketPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.t === "string" ? sp.t : null;
  const p = await getPlatform();
  const data = await p.support.ticketForViewer(await headers(), id, token);
  if (!data) notFound();
  const { ticket, messages } = data;
  return (
    <div className="sup-root mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="eyebrow">Support request #{ticket.id.slice(0, 8)}</p>
      <h1 className="mt-3 display text-[2rem] sm:text-[2.6rem]">{ticket.subject}</h1>
      <p className="mt-3 text-sm text-muted">
        <StatusBadge status={ticket.status} /> {CATEGORY_LABELS[ticket.category]}
        {ticket.escalated ? " · a person on our team handles this request" : ""}
      </p>
      <div className="mt-6 space-y-3">
        {sp.created === "1" && (
          <Notice kind="success">
            Thanks, we received your request.{" "}
            {data.via === "token" ? "We emailed you a private link to this page; keep it to follow up." : "We will email you when there is a reply."}
          </Notice>
        )}
        {sp.updated === "1" && <Notice kind="success">Saved.</Notice>}
      </div>
      <div className="mt-8">
        <TicketThread messages={messages} />
      </div>
      <CustomerTicketActions ticketId={ticket.id} status={ticket.status} token={data.via === "token" ? data.token : undefined} error={typeof sp.error === "string" ? sp.error : null} />
      {data.via === "member" && (
        <p className="mt-8">
          <Link href="/support/tickets" className="text-accent underline">
            All your requests
          </Link>
        </p>
      )}
    </div>
  );
}
