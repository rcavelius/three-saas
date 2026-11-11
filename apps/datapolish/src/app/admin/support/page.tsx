import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isCategory, isStatus, type QueueFilter } from "@repo/support";
import { AdminQueueFilters, AdminQueueTable } from "@repo/support/ui";
import { getPlatform } from "@/server/platform";
import { requireOperator } from "@/server/routes";

export const metadata: Metadata = { title: "Support queue", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await getPlatform();
  if (!(await requireOperator(p, new Headers(await headers())))) notFound();
  const sp = await searchParams;
  const filter: QueueFilter = {
    status: sp.status === "active" || isStatus(sp.status) ? sp.status : "active",
    priority: sp.priority === "high" || sp.priority === "normal" || sp.priority === "low" ? sp.priority : undefined,
    category: isCategory(sp.category) ? sp.category : undefined,
  };
  const [tickets, counts, budget] = await Promise.all([p.support.adminQueue(filter), p.support.adminCounts(), p.support.budgetStatus()]);
  return (
    <div className="sup-root mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <p className="eyebrow">
        <Link href="/admin" className="underline">
          Internal
        </Link>{" "}
        / Support
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Support queue</h1>
      <p className="mt-2 text-sm text-ink-2">
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
