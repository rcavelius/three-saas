import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle, fmtDate } from "@/components/ui";
import { getSite } from "@/lib/monitoring/sites";
import { fingerprintIssue } from "@/lib/monitoring/diff";
import { getScan } from "@/lib/scans-repo";
import { CHECK_DOCS } from "@/lib/check-docs";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Issue", robots: { index: false } };

export default async function IssuePage({ params }: { params: Promise<{ id: string; fp: string }> }) {
  const { id, fp } = await params;
  if (!/^[0-9a-f]{32}$/.test(fp)) notFound();
  const v = await requireViewer(`/dashboard/sites/${id}/issues/${fp}`);
  const ex = v.p.handle.executor;
  const site = await getSite(ex, v.org.id, id);
  if (!site) notFound();
  const { rows: episodes } = await ex.query<{
    rule_id: string;
    check_id: string;
    severity: string;
    message: string;
    page: string | null;
    opened_at: string;
    last_seen_at: string;
    resolved_at: string | null;
    last_scan_id: string | null;
  }>(
    `SELECT rule_id, check_id, severity, message, page, opened_at, last_seen_at, resolved_at, last_scan_id
     FROM site_issues WHERE org_id = $1 AND site_id = $2 AND fingerprint = $3 ORDER BY opened_at DESC`,
    [v.org.id, site.id, fp],
  );
  const latest = episodes[0];
  if (!latest) notFound();
  // Full detail (where it is linked from, how to fix) from the most recent scan that saw it.
  const scan = latest.last_scan_id ? await getScan(ex, latest.last_scan_id, v.p.now()) : null;
  const issue = scan && scan.orgId === v.org.id ? scan.report.issues.find((i) => fingerprintIssue(i) === fp) : undefined;
  const doc = CHECK_DOCS.find((d) => d.id === latest.check_id);

  return (
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
      <p className="mb-6 text-sm">
        <Link href={`/dashboard/sites/${site.id}`} className="text-accent underline">
          &larr; {new URL(site.url).host}
        </Link>
      </p>
      <PageTitle eyebrow={`${latest.severity} · ${latest.rule_id}`} title={latest.message} />
      <dl className="mt-8 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">Status</dt>
        <dd>{latest.resolved_at ? `Fixed on ${fmtDate(new Date(latest.resolved_at).toISOString())}` : "Open"}</dd>
        <dt className="font-semibold">Page</dt>
        <dd className="num break-all">{latest.page ?? "Site-wide"}</dd>
        <dt className="font-semibold">First seen</dt>
        <dd>{fmtDate(new Date(latest.opened_at).toISOString())}</dd>
        <dt className="font-semibold">Last seen</dt>
        <dd>{fmtDate(new Date(latest.last_seen_at).toISOString())}</dd>
        {issue?.detail && (
          <>
            <dt className="font-semibold">Detail</dt>
            <dd className="break-words">{issue.detail}</dd>
          </>
        )}
      </dl>
      {issue && (
        <section aria-labelledby="fix" className="mt-10 border-l-2 border-accent bg-accent-wash px-5 py-4">
          <h2 id="fix" className="font-semibold">
            How to fix it
          </h2>
          <p className="mt-2 leading-relaxed text-ink-soft">{issue.howToFix}</p>
        </section>
      )}
      {doc && (
        <p className="mt-6 text-sm">
          About this check:{" "}
          <Link className="text-accent underline" href={`/docs#${doc.id}`}>
            {doc.title}
          </Link>
        </p>
      )}
      {episodes.length > 1 && (
        <section aria-labelledby="episodes" className="mt-10">
          <h2 id="episodes" className="font-display text-xl font-semibold">
            Earlier occurrences
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            {episodes.slice(1).map((e, i) => (
              <li key={i}>
                {fmtDate(new Date(e.opened_at).toISOString())} → {e.resolved_at ? fmtDate(new Date(e.resolved_at).toISOString()) : "open"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
