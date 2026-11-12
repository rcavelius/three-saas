"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ScanProgress, ScanReport } from "@/lib/scanner/types";
import { Report } from "./Report";
import { CopyLink } from "./CopyLink";
import { track } from "@/lib/client/track";

type StreamEvent =
  | { type: "accepted"; url: string }
  | { type: "progress"; event: ScanProgress }
  | { type: "result"; id: string; reportUrl: string; report: ScanReport }
  | { type: "error"; error: string };

interface LogLine {
  t: number;
  text: string;
}

type State =
  | { kind: "idle" }
  | { kind: "running"; url: string; started: number; phase: string; pages: number; maxPages: number; log: LogLine[] }
  | { kind: "done"; id: string; reportUrl: string; report: ScanReport }
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

export function Scanner() {
  const inputId = useId();
  const hintId = useId();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [announce, setAnnounce] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
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
    if (!value || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const started = Date.now();
    setNow(started);
    setState({ kind: "running", url: value, started, phase: "Starting", pages: 0, maxPages: 25, log: [{ t: started, text: `Request accepted for ${value}` }] });
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
          if (ev.type === "progress") {
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
            setState({ kind: "done", id: ev.id, reportUrl: ev.reportUrl, report: ev.report });
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
    <div>
      <form onSubmit={onSubmit} noValidate className="no-print" aria-describedby={hintId}>
        <label htmlFor={inputId} className="eyebrow block !text-ink-soft">
          Website address
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id={inputId}
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={2048}
            placeholder="yourdomain.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            className="num min-h-12 w-full flex-1 rounded-none border border-ink bg-sheet px-4 text-base text-ink placeholder:text-muted/70 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          />
          {running ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="min-h-12 border border-ink px-6 font-medium text-ink hover:bg-paper-deep"
            >
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              className="min-h-12 bg-accent px-7 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
              disabled={!url.trim()}
            >
              Inspect site
            </button>
          )}
        </div>
        <p id={hintId} className="mt-3 text-sm text-muted">
          Free, no account. Up to 25 pages, about a minute. We follow your robots.txt.
        </p>
      </form>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {state.kind === "running" && (
        <div className="mt-8 border border-rule bg-sheet" aria-busy="true">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
            <p className="font-medium">{state.phase}&hellip;</p>
            <p className="num text-sm text-muted">
              {state.pages}/{state.maxPages} pages &middot; {elapsed}s
            </p>
          </div>
          <div className="h-1 bg-paper-deep" aria-hidden="true">
            <div className="h-1 bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, (state.pages / state.maxPages) * 100)}%` }} />
          </div>
          <ol className="num max-h-56 overflow-y-auto px-4 py-3 text-[0.78rem] leading-6 text-ink-soft" aria-label="Scan log">
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
        <p ref={errorRef} tabIndex={-1} className="mt-6 border-l-2 border-fail bg-fail-wash px-4 py-3 text-ink" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === "done" && (
        <div className="mt-10">
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              Saved as a private link:{" "}
              <a href={state.reportUrl} className="num text-accent underline">
                {state.reportUrl}
              </a>
            </p>
            <div className="flex gap-2">
              <CopyLink path={state.reportUrl} />
              <button type="button" onClick={() => window.print()} className="border border-ink px-3 py-1.5 hover:bg-paper-deep">
                Print / PDF
              </button>
            </div>
          </div>
          <div ref={reportRef} tabIndex={-1} className="focus:outline-none">
            <Report report={state.report} id={state.id} />
          </div>
        </div>
      )}
    </div>
  );
}
