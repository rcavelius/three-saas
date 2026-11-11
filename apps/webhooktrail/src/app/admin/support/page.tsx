import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isCategory, isStatus, type QueueFilter } from "@repo/support";
import { AdminQueueFilters, AdminQueueTable } from "@repo/support/ui";
import { getOperator } from "@/lib/admin";
import { getPlatform } from "@/lib/platform";

export const metadata: Metadata = { title: "Support queue", robots: { index: false, follow: false } };

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await getPlatform();
  if (!(await getOperator(p, new Headers(await headers())))) notFound();
  const sp = await searchParams;
  const filter: QueueFilter = {
    status: sp.status === "active" || isStatus(sp.status) ? sp.status : "active",
    priority: sp.priority === "high" || sp.priority === "normal" || sp.priority === "low" ? sp.priority : undefined,
    category: isCategory(sp.category) ? sp.category : undefined,
  };
  const [tickets, counts, budget] = await Promise.all([p.support.adminQueue(filter), p.support.adminCounts(), p.support.budgetStatus()]);
  return (
    <div className="sup-root mx-auto w-full max-w-[1300px] px-4 py-10">
      <p className="label">
        <Link href="/admin" className="underline">
          Operations
        </Link>{" "}
        / Support
      </p>
      <h1 className="mt-2 text-[26px] font-semibold">Support queue</h1>
      <p className="mt-2 text-[13px] text-fg-muted">
        {counts.open} active · {counts.waitingOnOperator} waiting on us · {counts.escalated} escalated. Assistant ({p.support.aiEnabled ? p.support.model : "AI off: search fallback"}) spend this month: $
        {(budget.monthMicros / 1e6).toFixed(4)} of ${(budget.monthlyCapMicros / 1e6).toFixed(2)}.
      </p>
      <div className="mt-6">
        <AdminQueueFilters action="/admin/support" status={filter.status} priority={filter.priority} category={filter.category} />
        <AdminQueueTable tickets={tickets} basePath="/admin/support" />
      </div>
    </div>
  );
}
