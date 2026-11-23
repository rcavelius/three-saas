import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Report } from "@/components/Report";
import { ReportPaywall } from "@/components/ReportPaywall";
import { PassActiveNote, PassReturnNotice, type PassReturnStatus } from "@/components/PassNotices";
import { CopyLink } from "@/components/CopyLink";
import { PrintButton } from "@/components/PrintButton";
import { getPlatform } from "@/lib/platform";
import { loadReportView } from "@/lib/report-access";
import { reportOffer } from "@/lib/offer";
import { SCAN_ID_PATTERN } from "@/lib/scans-repo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inspection report",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const RETURN_STATUSES: readonly PassReturnStatus[] = ["active", "unpaid", "expired", "revoked", "invalid", "error", "canceled"];

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!SCAN_ID_PATTERN.test(id)) notFound();
  const p = await getPlatform();
  // The lock is applied here, on the server: a viewer without fullReport never receives the withheld issues.
  const view = await loadReportView(p, await headers(), id);
  if (!view) notFound();
  const { scan, ents, report, locked } = view;
  const account = scan.orgId !== null;
  const pdf = ents.features.pdfReports === true;
  const sp = await searchParams;
  const rawStatus = typeof sp.pass === "string" ? sp.pass : null;
  const passStatus = rawStatus && (RETURN_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as PassReturnStatus) : null;
  const pass = ents.pass;
  const unlockPath = pass ? `/api/billing/pass/claim?session_id=${encodeURIComponent(pass.id)}&next=${encodeURIComponent(`/report/${id}`)}` : null;

  return (
    <div className="mx-auto max-w-5xl px-3 py-10 sm:px-8">
      {passStatus && <PassReturnNotice status={passStatus} expiresAt={pass ? pass.expiresAt.toISOString() : null} />}
      {pass && unlockPath && passStatus !== "unpaid" && <PassActiveNote name={pass.name} expiresAt={pass.expiresAt.toISOString()} unlockPath={unlockPath} />}
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        {account && scan.siteId ? (
          <Link href={`/dashboard/sites/${scan.siteId}`} className="text-accent underline underline-offset-4">
            &larr; Back to the site
          </Link>
        ) : (
          <Link href="/" className="text-accent underline underline-offset-4">
            &larr; Run another inspection
          </Link>
        )}
        <div className="flex flex-wrap gap-2">
          {!account && <CopyLink path={`/report/${id}`} />}
          <a href={`/api/report/${id}`} className="btn-secondary !min-h-9 !px-3 text-sm">
            JSON
          </a>
          {pdf ? (
            <a href={`/api/reports/${id}/pdf`} className="btn-secondary !min-h-9 !px-3 text-sm">
              Download PDF
            </a>
          ) : (
            <PrintButton />
          )}
        </div>
      </div>
      <Report
        report={report}
        id={id}
        locked={locked}
        paywall={locked ? <ReportPaywall locked={locked} startUrl={report.startUrl} reportId={id} offer={reportOffer()} where="report" /> : undefined}
      />
      <p className="no-print mt-4 text-xs text-muted">
        {account
          ? "Only members of this workspace can open this report."
          : locked
            ? "Anyone with this link can view the free summary of this report. Reports are deleted automatically after the retention period."
            : "Anyone with this link can view the report (the full issue list needs a pass or plan). Reports are deleted automatically after the retention period."}
      </p>
    </div>
  );
}
