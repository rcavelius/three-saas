import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Report } from "@/components/Report";
import { CopyLink } from "@/components/CopyLink";
import { PrintButton } from "@/components/PrintButton";
import { getDb } from "@/lib/db";
import { getScan, SCAN_ID_PATTERN } from "@/lib/scans-repo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inspection report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SCAN_ID_PATTERN.test(id)) notFound();
  const scan = await getScan((await getDb()).executor, id);
  if (!scan) notFound();

  return (
    <div className="mx-auto max-w-5xl px-3 py-10 sm:px-8">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/" className="text-accent underline underline-offset-4">
          &larr; Run another inspection
        </Link>
        <div className="flex gap-2">
          <CopyLink path={`/report/${id}`} />
          <a href={`/api/report/${id}`} className="border border-ink px-3 py-1.5 hover:bg-paper-deep">
            JSON
          </a>
          <PrintButton />
        </div>
      </div>
      <Report report={scan.report} id={id} />
      <p className="no-print mt-4 text-xs text-muted">
        Anyone with this link can view the report. Reports are deleted automatically after the retention period.
      </p>
    </div>
  );
}
