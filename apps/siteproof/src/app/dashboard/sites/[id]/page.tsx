import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteSiteButton, ScanNowButton, SiteSettings } from "@/components/dashboard/SiteControls";
import { Score, SiteStatus, Sparkline } from "@/components/dashboard/bits";
import { Notice, PageTitle, fmtDate } from "@/components/ui";
import { getSite } from "@/lib/monitoring/sites";
import { getScanFingerprints, listSiteScans } from "@/lib/scans-repo";
import { requireViewer } from "@/lib/viewer";
import type { IssueFingerprint } from "@/lib/monitoring/diff";

export const metadata: Metadata = { title: "Site", robots: { index: false } };

const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, notice: 2 };
const sevClass = (s: string) => (s === "critical" ? "text-fail" : s === "warning" ? "text-warn" : "text-ink-soft");

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer(`/dashboard/sites/${id}`);
  const ex = v.p.handle.executor;
  const site = await getSite(ex, v.org.id, id);
  if (!site) notFound();
  const scans = await listSiteScans(ex, v.org.id, site.id, 30);
  const { rows: open } = await ex.query<{ fingerprint: string; severity: string; message: string; page: string | null; opened_at: string }>(
    `SELECT fingerprint, severity, message, page, opened_at FROM site_issues WHERE org_id = $1 AND site_id = $2 AND resolved_at IS NULL`,
    [v.org.id, site.id],
  );
  open.sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || a.message.localeCompare(b.message));
  const { rows: alerts } = await ex.query<{ kind: string; title: string; status: string; created_at: string }>(
    `SELECT kind, title, status, created_at FROM alerts WHERE org_id = $1 AND site_id = $2 ORDER BY created_at DESC LIMIT 10`,
    [v.org.id, site.id],
  );
  const { rows: members } = await ex.query<{ user_id: string; name: string; email: string }>(
    `SELECT m.user_id, u.name, u.email FROM auth_member m JOIN auth_user u ON u.id = m.user_id WHERE m.organization_id = $1 ORDER BY m.created_at`,
    [v.org.id],
  );

  // Diff between the two most recent scans (fingerprints stored per scan).
  let diff: { added: IssueFingerprint[]; removed: IssueFingerprint[] } | null = null;
  if (scans.length >= 2) {
    const [cur, prev] = await Promise.all([getScanFingerprints(ex, v.org.id, scans[0]!.id), getScanFingerprints(ex, v.org.id, scans[1]!.id)]);
    if (cur && prev) {
      const prevSet = new Set(prev.map((f) => f.fp));
      const curSet = new Set(cur.map((f) => f.fp));
      diff = { added: cur.filter((f) => !prevSet.has(f.fp)), removed: prev.filter((f) => !curSet.has(f.fp)) };
    }
  }
  const host = new URL(site.url).host;
  const canManage = v.role === "owner" || v.role === "admin";
  const pdf = v.ents.features.pdfReports === true;

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <p className="no-print mb-6 text-sm">
        <Link href="/dashboard" className="text-accent underline">
          &larr; All sites
        </Link>
      </p>
      <PageTitle eyebrow={v.org.name} title={host} lede={<span className="num text-base break-all">{site.url}</span>} />
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <SiteStatus status={site.status} paused={site.paused} planLocked={site.planLocked} />
        <span className="text-sm">
          Score <Score value={site.lastScore} />
        </span>
        <Sparkline values={[...scans].reverse().map((s) => s.score)} label="Score trend" />
        <span className="text-sm text-muted">
          Last scan {fmtDate(site.lastScanAt)} · {site.paused || site.planLocked ? "paused" : `next ${fmtDate(site.nextScanAt)}`}
        </span>
      </div>
      {site.status === "unreachable" && (
        <div className="mt-6">
          <Notice tone="error" role="alert">
            The site could not be reached in {site.consecutiveFailures} attempts in a row{site.lastError ? `: ${site.lastError}` : ""}. Monitoring continues and you
            will get an email when it is back.
          </Notice>
        </div>
      )}
      {site.planLocked && (
        <div className="mt-6">
          <Notice tone="warn">
            Paused because your plan allows fewer sites. History is kept. <Link className="text-accent underline" href="/account/billing">Change plan</Link>
          </Notice>
        </div>
      )}
      <div className="mt-6">
        <ScanNowButton siteId={site.id} disabled={site.paused || site.planLocked} />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-12">
          <section aria-labelledby="open">
            <h2 id="open" className="font-display text-2xl font-semibold">
              Open issues ({open.length})
            </h2>
            {open.length === 0 ? (
              <p className="mt-3 text-muted">{scans.length ? "Nothing open. " : "The first scan has not finished yet."}</p>
            ) : (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {open.slice(0, 100).map((i) => (
                  <li key={i.fingerprint} className="py-3">
                    <Link href={`/dashboard/sites/${site.id}/issues/${i.fingerprint}`} className="font-medium underline-offset-4 hover:underline">
                      <span className={`eyebrow mr-2 ${sevClass(i.severity)}`}>{i.severity}</span>
                      {i.message}
                    </Link>
                    <span className="block text-sm text-muted">
                      {i.page ? <span className="num break-all">{i.page}</span> : "Site-wide"} · open since {fmtDate(new Date(i.opened_at).toISOString())}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {open.length > 100 && <p className="mt-2 text-sm text-muted">Showing 100 of {open.length}; the full list is in the latest report.</p>}
          </section>

          {diff && (
            <section aria-labelledby="diff">
              <h2 id="diff" className="font-display text-2xl font-semibold">
                Since the previous scan
              </h2>
              <p className="mt-1 text-sm text-muted">
                {fmtDate(scans[1]!.createdAt)} → {fmtDate(scans[0]!.createdAt)}
              </p>
              {diff.added.length === 0 && diff.removed.length === 0 ? (
                <p className="mt-3 text-muted">No change in the issues found.</p>
              ) : (
                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-fail">New ({diff.added.length})</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {diff.added.slice(0, 30).map((f) => (
                        <li key={f.fp}>
                          <span className={`eyebrow mr-1 ${sevClass(f.severity)}`}>{f.severity}</span> {f.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold text-pass">Gone ({diff.removed.length})</h3>
                    <ul className="mt-2 space-y-2 text-sm">
                      {diff.removed.slice(0, 30).map((f) => (
                        <li key={f.fp}>
                          <span className={`eyebrow mr-1 ${sevClass(f.severity)}`}>{f.severity}</span> {f.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="history">
            <h2 id="history" className="font-display text-2xl font-semibold">
              Scan history
            </h2>
            <p className="mt-1 text-sm text-muted">Kept for {v.ents.limits.historyDays} days on your plan (the latest scan is always kept).</p>
            {scans.length === 0 ? (
              <p className="mt-3 text-muted">No scans yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <caption className="sr-only">Scans of {host}</caption>
                  <thead className="border-b border-ink">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold">When</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Score</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Critical / warn</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Pages</th>
                      <th scope="col" className="py-2 font-semibold">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {scans.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-3">{fmtDate(s.createdAt)}</td>
                        <td className="py-2 pr-3">{s.reachable === false ? <span className="text-fail">down</span> : <Score value={s.score} />}</td>
                        <td className="num py-2 pr-3">
                          {s.critical} / {s.warning}
                        </td>
                        <td className="num py-2 pr-3">{s.pages}</td>
                        <td className="py-2">
                          <Link href={`/report/${s.id}`} className="text-accent underline">
                            View
                          </Link>
                          {pdf && (
                            <>
                              {" · "}
                              <a href={`/api/reports/${s.id}/pdf`} className="text-accent underline">
                                PDF
                              </a>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-10">
          <section aria-labelledby="settings">
            <h2 id="settings" className="font-display text-2xl font-semibold">
              Monitoring &amp; alerts
            </h2>
            <div className="mt-4">
              <SiteSettings
                siteId={site.id}
                paused={site.paused}
                alertsMuted={site.alertsMuted}
                alertRecipients={site.alertRecipients}
                members={members.map((m) => ({ userId: m.user_id, label: m.name ? `${m.name} (${m.email})` : m.email }))}
                canManage={canManage}
                emailAlerts={v.ents.features.emailAlerts === true}
              />
            </div>
          </section>
          <section aria-labelledby="alerts">
            <h2 id="alerts" className="font-display text-2xl font-semibold">
              Recent alerts
            </h2>
            {alerts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No alerts yet. You are emailed only when something meaningful changes.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {alerts.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.title}</span>
                    <span className="block text-muted">
                      {fmtDate(new Date(a.created_at).toISOString())} · {a.status === "sent" ? "emailed" : a.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canManage && (
            <section aria-labelledby="remove">
              <h2 id="remove" className="font-display text-xl font-semibold">
                Remove
              </h2>
              <div className="mt-3">
                <DeleteSiteButton siteId={site.id} host={host} />
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
