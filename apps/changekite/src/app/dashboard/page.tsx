import type { Metadata } from "next";
import Link from "next/link";
import { paidPlans, CHANGEKITE_CATALOG } from "@repo/billing";
import { AddSiteForm } from "@/components/dashboard/SiteControls";
import { Score, SiteStatus, Sparkline } from "@/components/dashboard/bits";
import { Notice, PageTitle, fmtDate, primaryButton } from "@/components/ui";
import { listSites } from "@/lib/monitoring/sites";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Monitored sites", robots: { index: false } };

function host(url: string) {
  return new URL(url).host;
}

export default async function DashboardPage() {
  const v = await requireViewer("/dashboard");
  const sites = await listSites(v.p.handle.executor, v.org.id);
  const limit = v.ents.limits.sites ?? 0;
  const active = sites.filter((s) => !s.planLocked).length;
  const canManage = v.role === "owner" || v.role === "admin";
  const disabledReason =
    limit === 0
      ? null
      : !canManage
        ? "Only admins and owners can add sites."
        : limit !== -1 && active >= limit
          ? `Your ${v.ents.planName} plan includes ${limit} monitored site${limit === 1 ? "" : "s"}, all in use. Remove one or upgrade.`
          : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
      <PageTitle
        eyebrow={v.org.name}
        title="Monitored sites"
        lede={
          limit === 0
            ? "Monitoring re-scans your sites on a schedule and emails you when something breaks."
            : `${active} of ${limit === -1 ? "unlimited" : limit} sites on the ${v.ents.planName} plan · scanned every ${v.ents.limits.scanFrequencyHours} hours · up to ${v.ents.limits.pagesPerScan} pages per scan.`
        }
      />

      {limit === 0 ? (
        <div className="mt-10 max-w-2xl space-y-4">
          <Notice tone="info">
            You are on the free plan: one-off scans from the{" "}
            <Link href="/" className="text-accent underline">
              home page
            </Link>{" "}
            stay free, but monitoring needs a paid plan:{" "}
            {paidPlans(CHANGEKITE_CATALOG)
              .map((p) => `${p.name} ($${p.priceMonthlyCents / 100}/month, ${p.limits.sites} sites)`)
              .join(" or ")}
            .
          </Notice>
          <Link href="/account/billing" className={primaryButton}>
            See plans
          </Link>
        </div>
      ) : (
        <>
          <section aria-labelledby="add" className="mt-10 max-w-2xl">
            <h2 id="add" className="sr-only">
              Add a site
            </h2>
            <AddSiteForm disabledReason={disabledReason} />
          </section>

          <section aria-labelledby="sites" className="mt-12">
            <h2 id="sites" className="font-display text-2xl font-semibold">
              Sites
            </h2>
            {sites.length === 0 ? (
              <p className="mt-4 text-muted">No sites yet. Add the address of a site you look after.</p>
            ) : (
              <div className="relative mt-4 overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-[0.95rem]">
                  <caption className="sr-only">Monitored sites with status, score and open issues</caption>
                  <thead className="border-b border-ink text-sm">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-semibold">Site</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Score</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Trend</th>
                      <th scope="col" className="py-2 pr-4 font-semibold">Open issues</th>
                      <th scope="col" className="py-2 font-semibold">Last / next scan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {sites.map((s) => (
                      <tr key={s.id} className="align-top">
                        <td className="py-3 pr-4">
                          <Link href={`/dashboard/sites/${s.id}`} className="font-medium text-accent underline-offset-4 hover:underline">
                            {host(s.url)}
                          </Link>
                          {s.alertsMuted && <span className="block text-xs text-muted">alerts muted</span>}
                        </td>
                        <td className="py-3 pr-4">
                          <SiteStatus status={s.status} paused={s.paused} planLocked={s.planLocked} />
                        </td>
                        <td className="py-3 pr-4">
                          <Score value={s.lastScore} />
                        </td>
                        <td className="py-3 pr-4">
                          <Sparkline values={s.trend} label={`${host(s.url)} trend`} />
                        </td>
                        <td className="py-3 pr-4 text-sm">
                          <span className={s.openCritical ? "font-semibold text-fail" : ""}>{s.openCritical} critical</span>
                          <span className="block text-muted">{s.openWarnings} warnings</span>
                        </td>
                        <td className="py-3 text-sm">
                          <span className="block">{fmtDate(s.lastScanAt)}</span>
                          <span className="block text-muted">
                            {s.paused || s.planLocked ? "paused" : s.nextScanAt ? `next ${fmtDate(s.nextScanAt)}` : "queued"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {sites.some((s) => s.planLocked) && (
        <div className="mt-8">
          <Notice tone="warn">
            Some sites are paused because your current plan allows fewer sites. Their history is kept.{" "}
            <Link href="/account/billing" className="text-accent underline">
              Change plan
            </Link>
          </Notice>
        </div>
      )}
    </div>
  );
}
