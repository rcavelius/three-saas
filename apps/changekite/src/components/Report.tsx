/**
 * The audit document. Pure presentational (no hooks) so it renders on the server (/report/[id]) and inside the
 * client-side scanner. Imports only types and the score table, never network code.
 */
import type { ReactNode } from "react";
import type { CheckStatus, Issue, ScanReport, Severity } from "@/lib/scanner/types";
import { SCORE_RULES } from "@/lib/scanner/score";
import type { LockedSummary } from "@/lib/report-gate";

const SEVERITY_META: Record<Severity, { label: string; plural: string; prefix: string; text: string; wash: string; rule: string }> = {
  critical: { label: "Critical", plural: "Critical", prefix: "C", text: "text-fail", wash: "bg-fail-wash", rule: "border-fail" },
  warning: { label: "Warning", plural: "Warnings", prefix: "W", text: "text-warn", wash: "bg-warn-wash", rule: "border-warn" },
  notice: { label: "Notice", plural: "Notices", prefix: "N", text: "text-ink-soft", wash: "bg-paper-deep", rule: "border-rule-strong" },
};

const STATUS_META: Record<CheckStatus, { glyph: string; label: string; cls: string }> = {
  pass: { glyph: "✓", label: "Pass", cls: "text-pass" },
  warn: { glyph: "!", label: "Attention", cls: "text-warn" },
  fail: { glyph: "✕", label: "Fail", cls: "text-fail" },
  info: { glyph: "i", label: "Note", cls: "text-ink-soft" },
  skipped: { glyph: "—", label: "Not checked", cls: "text-muted" },
};

const GRADE_META = {
  good: { label: "In good order", cls: "text-pass" },
  fair: { label: "Needs attention", cls: "text-warn" },
  poor: { label: "Serious problems", cls: "text-fail" },
} as const;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function StatusMark({ status }: { status: CheckStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${m.cls}`}>
      <span aria-hidden="true" className="num inline-grid h-5 w-5 place-items-center rounded-full border border-current text-[0.7rem] leading-none">
        {m.glyph}
      </span>
      {m.label}
    </span>
  );
}

function ExternalUrl({ url }: { url: string }) {
  let safe = false;
  try {
    const u = new URL(url);
    safe = u.protocol === "http:" || u.protocol === "https:";
  } catch {
    safe = false;
  }
  if (!safe) return <span className="num break-all text-[0.8rem]">{url}</span>;
  return (
    <a href={url} rel="nofollow noopener noreferrer" target="_blank" className="num break-all text-[0.8rem] text-accent underline decoration-rule-strong hover:decoration-accent">
      {url}
    </a>
  );
}

function Finding({ issue, n }: { issue: Issue; n: string }) {
  const sev = SEVERITY_META[issue.severity];
  return (
    <li className={`grid grid-cols-[3rem_1fr] gap-x-3 border-t border-rule py-5 first:border-t-0 sm:grid-cols-[4rem_1fr]`}>
      <span className={`num pt-0.5 text-sm font-medium ${sev.text}`}>{n}</span>
      <div className="min-w-0">
        <p className="font-medium leading-snug text-ink [overflow-wrap:anywhere]">{issue.message}</p>
        {issue.page && (
          <p className="mt-1.5">
            <ExternalUrl url={issue.page} />
          </p>
        )}
        {issue.detail && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{issue.detail}</p>}
        <div className={`mt-3 border-l-2 ${sev.rule} pl-3`}>
          <p className="eyebrow !text-[0.66rem]">How to fix</p>
          <p className="mt-1 whitespace-pre-line text-[0.94rem] leading-relaxed text-ink-soft">{issue.howToFix}</p>
        </div>
      </div>
    </li>
  );
}

/**
 * `locked` (from the server's gateReport) means `report.issues` holds only the top issues and the page list was
 * withheld; `paywall` renders right under those top issues.
 */
export function Report({ report, id, locked = null, paywall }: { report: ScanReport; id?: string; locked?: LockedSummary | null; paywall?: ReactNode }) {
  const grade = GRADE_META[report.grade];
  const bySeverity = (s: Severity) => report.issues.filter((i) => i.severity === s);
  const tls = report.https.tls;

  return (
    <article className="border border-rule bg-sheet text-ink shadow-[0_1px_0_var(--color-rule),0_12px_32px_-24px_rgba(28,26,22,0.35)]" aria-labelledby="report-title">
      {/* Masthead */}
      <header className="border-b-2 border-ink px-5 pb-6 pt-7 sm:px-10 sm:pt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Website inspection report</p>
          {id && <p className="eyebrow num">Ref. {id.slice(0, 8)}</p>}
        </div>
        <h1 id="report-title" className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
          {host(report.finalUrl)}
        </h1>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="eyebrow">Inspected</dt>
            <dd className="num mt-1">{fmtDate(report.finishedAt)}</dd>
          </div>
          <div>
            <dt className="eyebrow">Pages read</dt>
            <dd className="num mt-1">
              {report.stats.pagesCrawled} <span className="text-muted">/ {report.limits.maxPages} max</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Duration</dt>
            <dd className="num mt-1">{fmtDuration(report.durationMs)}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="eyebrow">Start URL</dt>
            <dd className="num mt-1 break-all">{report.startUrl}</dd>
          </div>
        </dl>
      </header>

      {/* Verdict */}
      <section aria-labelledby="verdict" className="grid gap-6 border-b border-rule px-5 py-7 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-12 sm:px-10">
        <div>
          <h2 id="verdict" className="eyebrow">Score</h2>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="num text-6xl font-medium leading-none tracking-tight sm:text-7xl">{report.score}</span>
            <span className="num text-xl text-muted">/100</span>
          </p>
          <p className={`mt-2 font-display text-lg italic ${grade.cls}`}>{grade.label}</p>
        </div>
        <div>
          <dl className="grid grid-cols-3 border-y border-rule text-center">
            {(["critical", "warning", "notice"] as const).map((s) => (
              <div key={s} className="border-l border-rule py-3 first:border-l-0">
                <dt className="eyebrow">{SEVERITY_META[s].plural}</dt>
                <dd className={`num mt-1 text-3xl ${report.counts[s] ? SEVERITY_META[s].text : "text-muted"}`}>{report.counts[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Score = 100 &minus; {SCORE_RULES.critical.points} per critical (max {SCORE_RULES.critical.cap}) &minus; {SCORE_RULES.warning.points} per
            warning (max {SCORE_RULES.warning.cap}) &minus; {SCORE_RULES.notice.points} per notice (max {SCORE_RULES.notice.cap}). It summarises this
            scan only; read the findings, not just the number.
          </p>
        </div>
      </section>

      {/* 1. Summary */}
      <section aria-labelledby="s-summary" className="px-5 py-8 sm:px-10">
        <h2 id="s-summary" className="font-display text-2xl font-semibold">
          <span className="num mr-3 text-base text-muted">1</span>Summary of checks
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[0.94rem]">
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="eyebrow py-2 pr-4 font-normal">Check</th>
                <th scope="col" className="eyebrow py-2 pr-4 font-normal">Result</th>
                <th scope="col" className="eyebrow py-2 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.id} className="border-b border-rule align-top">
                  <th scope="row" className="py-2.5 pr-4 font-medium">
                    <a href={`/docs#${c.id}`} className="hover:underline">{c.label}</a>
                  </th>
                  <td className="whitespace-nowrap py-2.5 pr-4"><StatusMark status={c.status} /></td>
                  <td className="py-2.5 text-muted">{c.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Findings */}
      <section aria-labelledby="s-findings" className="border-t border-rule px-5 py-8 sm:px-10">
        <h2 id="s-findings" className="font-display text-2xl font-semibold">
          <span className="num mr-3 text-base text-muted">2</span>Findings
        </h2>
        {report.issues.length === 0 && <p className="mt-4 text-ink-soft">No problems were found on the pages we inspected.</p>}
        {locked && (
          <>
            <p className="mt-3 text-ink-soft">
              The {locked.shown === 1 ? "most severe issue" : `${locked.shown} most severe issues`} of {locked.total}, with how to fix{" "}
              {locked.shown === 1 ? "it" : "them"}.
            </p>
            <ol className="mt-4 list-none border-t border-ink">
              {report.issues.map((issue, i) => (
                <Finding key={`${issue.id}-${i}`} issue={issue} n={`${SEVERITY_META[issue.severity].prefix}${i + 1}`} />
              ))}
            </ol>
            {paywall}
          </>
        )}
        {!locked && (["critical", "warning", "notice"] as const).map((s, si) => {
          const list = bySeverity(s);
          if (!list.length) return null;
          const meta = SEVERITY_META[s];
          return (
            <section key={s} aria-labelledby={`f-${s}`} className="mt-8">
              <h3 id={`f-${s}`} className="flex items-baseline gap-3 border-b border-ink pb-2">
                <span className="num text-sm text-muted">2.{si + 1}</span>
                <span className={`font-semibold ${meta.text}`}>{meta.plural}</span>
                <span className="num text-sm text-muted">({list.length})</span>
              </h3>
              <ol className="list-none">
                {list.map((issue, i) => (
                  <Finding key={`${issue.id}-${i}`} issue={issue} n={`${meta.prefix}${i + 1}`} />
                ))}
              </ol>
            </section>
          );
        })}
      </section>

      {/* 3. Pages */}
      <section aria-labelledby="s-pages" className="print-break border-t border-rule px-5 py-8 sm:px-10">
        <h2 id="s-pages" className="font-display text-2xl font-semibold">
          <span className="num mr-3 text-base text-muted">3</span>Pages inspected
        </h2>
        {locked ? (
          <p className="mt-4 text-ink-soft">
            {report.stats.pagesCrawled} pages were read. The page-by-page list with status codes is part of the full report.
          </p>
        ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="eyebrow w-10 py-2 pr-3 font-normal">#</th>
                <th scope="col" className="eyebrow w-16 py-2 pr-3 font-normal">Status</th>
                <th scope="col" className="eyebrow w-14 py-2 pr-3 font-normal">Depth</th>
                <th scope="col" className="eyebrow py-2 font-normal">Page</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((p, i) => (
                <tr key={p.url} className="border-b border-rule align-top">
                  <td className="num py-2 pr-3 text-muted">{i + 1}</td>
                  <td className={`num py-2 pr-3 ${p.status === null || p.status >= 400 ? "text-fail" : p.status >= 300 ? "text-warn" : ""}`}>
                    {p.status ?? "ERR"}
                  </td>
                  <td className="num py-2 pr-3 text-muted">{p.depth}</td>
                  <td className="py-2">
                    <span className="num block break-all text-[0.8rem]">{p.url}</span>
                    {p.finalUrl !== p.url && <span className="num block break-all text-[0.75rem] text-muted">&rarr; {p.finalUrl}</span>}
                    {p.title && <span className="block text-muted [overflow-wrap:anywhere]">{p.title}</span>}
                    {p.error && <span className="block text-fail">{p.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {/* 4. Site facts */}
      <section aria-labelledby="s-facts" className="border-t border-rule px-5 py-8 sm:px-10">
        <h2 id="s-facts" className="font-display text-2xl font-semibold">
          <span className="num mr-3 text-base text-muted">4</span>Site facts
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Certificate</dt>
            <dd className="mt-1 text-ink-soft">
              {tls
                ? `${tls.valid ? "Trusted" : "Not trusted"}${tls.issuer ? `, issued by ${tls.issuer}` : ""}${tls.validTo ? `, valid until ${tls.validTo.slice(0, 10)}` : ""}${tls.daysRemaining !== undefined ? ` (${tls.daysRemaining} days)` : ""}${tls.protocol ? `, ${tls.protocol}` : ""}`
                : report.https.servesHttps
                  ? "Could not be read"
                  : "No HTTPS"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">HSTS</dt>
            <dd className="num mt-1 break-all text-ink-soft">{report.https.hsts || "Not sent"}</dd>
          </div>
          <div>
            <dt className="eyebrow">robots.txt</dt>
            <dd className="mt-1 text-ink-soft">
              {report.robots.found ? "Present" : report.robots.status ? `Not found (HTTP ${report.robots.status})` : "Not found"}
              {report.robots.crawlDelaySeconds !== undefined ? `, Crawl-delay ${report.robots.crawlDelaySeconds}s` : ""}
              {report.robots.sitemaps.length ? `, ${report.robots.sitemaps.length} sitemap reference${report.robots.sitemaps.length === 1 ? "" : "s"}` : ""}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Sitemap</dt>
            <dd className="mt-1 text-ink-soft">
              {report.sitemap.found
                ? report.sitemap.error
                  ? "Found but invalid"
                  : `${report.sitemap.kind === "sitemapindex" ? `Index of ${report.sitemap.childSitemaps} sitemaps, ` : ""}${report.sitemap.urlCount} URLs`
                : "Not found"}
              {report.sitemap.url && <span className="num block break-all text-[0.78rem] text-muted">{report.sitemap.url}</span>}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Links</dt>
            <dd className="num mt-1 text-ink-soft">
              {report.stats.internalUrlsFound} internal, {report.stats.externalLinksFound} external ({report.stats.externalLinksChecked} checked)
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Images</dt>
            <dd className="num mt-1 text-ink-soft">{report.stats.imagesFound} found</dd>
          </div>
        </dl>
      </section>

      <footer className="border-t border-rule px-5 py-5 text-xs leading-relaxed text-muted sm:px-10">
        Inspected by ChangeKiteBot/1.0 from public pages only. Limits for this scan: {report.limits.maxPages} pages, depth {report.limits.maxDepth},{" "}
        {report.limits.maxExternalLinks} external links, {Math.round(report.limits.timeBudgetMs / 1000)} s. Findings describe what the server returned at
        the time of the scan.
      </footer>
    </article>
  );
}
