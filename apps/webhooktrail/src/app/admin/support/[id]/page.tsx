import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { maskEmail } from "@repo/ops";
import { CATEGORY_LABELS } from "@repo/support";
import { AdminTicketActions, Notice, StatusBadge, TicketThread, formatDate } from "@repo/support/ui";
import { getOperator } from "@/lib/admin";
import { getPlatform } from "@/lib/platform";

export const metadata: Metadata = { title: "Support ticket", robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminTicketPage({ params, searchParams }: Props) {
  const p = await getPlatform();
  if (!(await getOperator(p, new Headers(await headers())))) notFound();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await p.support.adminTicket(id);
  if (!data) notFound();
  const t = data.ticket;
  return (
    <div className="sup-root mx-auto w-full max-w-[1000px] px-4 py-10">
      <p className="label">
        <Link href="/admin/support" className="underline">
          Support queue
        </Link>{" "}
        / #{t.id.slice(0, 8)}
      </p>
      <h1 className="mt-2 text-[22px] font-semibold">{t.subject}</h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        <StatusBadge status={t.status} /> {CATEGORY_LABELS[t.category]} · priority {t.priority}
        {t.escalated ? ` · escalated: ${t.escalation_reason ?? ""}` : ""} · {t.email} ({t.org_id ? "signed-in customer" : "anonymous, token link"}) · opened {formatDate(t.created_at)}
      </p>
      {sp.msg === "saved" && (
        <div className="mt-4">
          <Notice kind="success">Saved. The customer was emailed at {maskEmail(t.email)}.</Notice>
        </div>
      )}
      {typeof sp.error === "string" && (
        <div className="mt-4">
          <Notice kind="error">Could not save: {sp.error.replace(/_/g, " ")}</Notice>
        </div>
      )}
      <div className="mt-6">
        <TicketThread messages={data.messages} perspective="operator" />
      </div>
      <AdminTicketActions ticketId={t.id} status={t.status} />
    </div>
  );
}
