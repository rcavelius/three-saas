"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ScanProgress, ScanReport } from "@/lib/scanner/types";
import { Report } from "./Report";
import { ReportPaywall } from "./ReportPaywall";
import type { LockedSummary } from "@/lib/report-gate";
import type { ReportOffer } from "@/lib/offer";
import { CopyLink } from "./CopyLink";
import { track } from "@/lib/client/track";

type StreamEvent =
  | { type: "accepted"; url: string; maxPages?: number }
  | { type: "progress"; event: ScanProgress }
  | { type: "result"; id: string; reportUrl: string; report: ScanReport; locked?: LockedSummary | null }
  | { type: "error"; error: string };

interface LogLine {
  t: number;
  text: string;
}

type State =
  | { kind: "idle" }
  | { kind: "running"; url: string; started: number; phase: string; pages: number; maxPages: number; log: LogLine[] }
  | { kind: "done"; id: string; reportUrl: string; report: ScanReport; locked: LockedSummary | null }
  | { kind: "error"; message: string };

const PHASE_LABEL: Record<string, string> = {
  robots: "Reading robots.txt",
  crawl: "Crawling pages",
  links: "Checking internal links",
  external: "Checking external links",
  sitemap: "Checking the sitemap",
  https: "Checking HTTPS and the certificate",
  report: "Writing the report",
};

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search).slice(0, 80) || "/";
  } catch {
    return url;
  }
}

/**
 * layout="hero": the root uses display:contents so the form and the results become items of the
 * home hero's grid (form under the headline, results across the full width below).
 */
export function Scanner({ offer, layout = "block", cta = "Scan free" }: { offer: ReportOffer; layout?: "block" | "hero"; cta?: string }) {
  const hero = layout === "hero";
  const inputId = useId();
  const hintId = useId();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [announce, setAnnounce] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const running = state.kind === "running";

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (state.kind === "done") reportRef.current?.focus();
    if (state.kind === "error") errorRef.current?.focus();
  }, [state.kind]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value) {
      inputRef.current?.focus();
      return;
    }
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const started = Date.now();
    setNow(started);
    setState({ kind: "running", url: value, started, phase: "Starting", pages: 0, maxPages: offer.freePages, log: [{ t: started, text: `Request accepted for ${value}` }] });
    setAnnounce("Scan started.");

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ url: value }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let message = `The scan could not start (HTTP ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* keep default */
        }
        setState({ kind: "error", message });
        setAnnounce(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (ev.type === "accepted") {
            const max = ev.maxPages;
            if (typeof max === "number" && max > 0) setState((s) => (s.kind === "running" ? { ...s, maxPages: max } : s));
          } else if (ev.type === "progress") {
            const p = ev.event;
            setState((s) => {
              if (s.kind !== "running") return s;
              const t = Date.now();
              if (p.type === "phase") {
                const label = PHASE_LABEL[p.phase] ?? p.message;
                return { ...s, phase: label, log: [...s.log, { t, text: p.message }].slice(-40) };
              }
              if (p.type === "page") {
                if (p.status === null) return s;
                return { ...s, pages: p.crawled, maxPages: p.max, log: [...s.log, { t, text: `${p.status}  ${shortPath(p.url)}` }].slice(-40) };
              }
              return s;
            });
            if (p.type === "phase") setAnnounce(PHASE_LABEL[p.phase] ?? p.message);
          } else if (ev.type === "result") {
            finished = true;
            track("tool_used", { tool: "scan", score: ev.report.score });
            setState({ kind: "done", id: ev.id, reportUrl: ev.reportUrl, report: ev.report, locked: ev.locked ?? null });
            setAnnounce(`Scan finished. Score ${ev.report.score} out of 100, ${ev.report.counts.critical} critical issues.`);
          } else if (ev.type === "error") {
            finished = true;
            setState({ kind: "error", message: ev.error });
            setAnnounce(ev.error);
          }
        }
      }
      if (!finished) {
        setState({ kind: "error", message: "The connection closed before the scan finished. Please try again." });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setState({ kind: "idle" });
        setAnnounce("Scan cancelled.");
      } else {
        setState({ kind: "error", message: "Could not reach the scanner. Check your connection and try again." });
      }
    } finally {
      abortRef.current = null;
    }
  }

  const elapsed = state.kind === "running" ? Math.max(0, Math.floor((now - state.started) / 1000)) : 0;

  return (
    <div className={hero ? "contents" : undefined}>
      <form
        id="scan"
        onSubmit={onSubmit}
        noValidate
        className={`no-print scroll-mt-28 ${hero ? "ck-in mt-6 lg:col-start-1 lg:row-start-2 lg:mt-10 lg:self-start" : ""}`}
        style={hero ? { ["--d" as string]: "200ms" } : undefined}
        aria-describedby={hintId}
      >
        <label htmlFor={inputId} className={hero ? "sr-only" : "block text-sm font-bold text-ink"}>
          Website address
        </label>
        <div
          className={`flex flex-col gap-2.5 sm:flex-row sm:gap-2 sm:rounded-full sm:bg-white sm:p-1.5 ${
            hero ? "" : "mt-2 sm:shadow-[0_0_0_1.5px_var(--color-rule-strong)] sm:focus-within:shadow-[0_0_0_2px_var(--color-accent)]"
          }`}
        >
          <input
            ref={inputRef}
            id={inputId}
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={2048}
            placeholder={hero ? "Your website, e.g. yourdomain.com" : "yourdomain.com"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            className={`min-h-[56px] w-full flex-1 rounded-full bg-white px-6 text-[1.05rem] font-semibold text-ink placeholder:font-medium placeholder:text-muted focus:outline-none disabled:opacity-60 sm:min-h-[52px] sm:bg-transparent sm:px-5 ${
              hero ? "focus-visible:ring-4 focus-visible:ring-kite sm:focus-visible:ring-0" : "border border-rule-strong focus:border-accent sm:border-0"
            }`}
          />
          {running ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="btn-secondary min-h-[56px] sm:min-h-[52px]">
              Cancel
            </button>
          ) : (
            <button type="submit" className={`${hero ? "btn-primary" : "btn-primary"} min-h-[56px] !px-8 text-base sm:min-h-[52px]`}>
              {cta}
            </button>
          )}
        </div>
        <p id={hintId} className={`mt-3 text-[0.95rem] font-medium ${hero ? "text-white" : "text-muted"}`}>
          Free, no account. Score and top {offer.freeIssues} fixes free; full report {offer.price} once.
        </p>
      </form>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {state.kind === "running" && (
        <div className={`card mt-8 overflow-hidden text-ink ${hero ? "lg:col-span-2 lg:row-start-3" : ""}`} aria-busy="true">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
            <p className="font-medium">{state.phase}&hellip;</p>
            <p className="num text-sm font-semibold text-muted">
              {state.pages}/{state.maxPages} pages &middot; {elapsed}s
            </p>
          </div>
          <div className="h-1.5 bg-paper-deep" aria-hidden="true">
            <div className="h-1.5 rounded-r-full bg-kite transition-[width] duration-500" style={{ width: `${Math.min(100, (state.pages / state.maxPages) * 100)}%` }} />
          </div>
          <ol className="num max-h-56 overflow-y-auto px-4 py-3 font-mono text-[0.78rem] leading-6 text-ink-soft" aria-label="Scan log">
            {state.log.map((l, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-muted">{String(Math.floor((l.t - state.started) / 1000)).padStart(2, "0")}s</span>
                <span className="break-all">{l.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {state.kind === "error" && (
        <p ref={errorRef} tabIndex={-1} className={`mt-6 rounded-xl bg-fail-wash px-4 py-3 font-medium text-fail ${hero ? "lg:col-start-1 lg:row-start-3" : ""}`} role="alert">
          {state.message}
        </p>
      )}

      {state.kind === "done" && (
        <div className={`mt-10 ${hero ? "rounded-[28px] bg-paper p-3 text-ink sm:p-5 lg:col-span-2 lg:row-start-3" : ""}`}>
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              Saved as a private link:{" "}
              <a href={state.reportUrl} className="num text-accent underline">
                {state.reportUrl}
              </a>
            </p>
            <div className="flex gap-2">
              <CopyLink path={state.reportUrl} />
              <button type="button" onClick={() => window.print()} className="btn-secondary !min-h-9 !px-3 text-sm">
                Print / PDF
              </button>
            </div>
          </div>
          <div ref={reportRef} tabIndex={-1} className="focus:outline-none">
            <Report
              report={state.report}
              id={state.id}
              locked={state.locked}
              paywall={
                state.locked ? <ReportPaywall locked={state.locked} startUrl={state.report.startUrl} reportId={state.id} offer={offer} where="scan" /> : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
