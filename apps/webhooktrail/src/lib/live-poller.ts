/**
 * Live inspector polling, framework-free so it can be tested deterministically.
 *
 * - Cursor polling (`?after=<seq>`) with ETag / If-None-Match: an unchanged endpoint answers 304.
 * - Gapless catch-up: the server returns the OLDEST requests after the cursor plus `hasMore`, so
 *   after a pause, a hidden tab or an outage the poller pages forward immediately until it is
 *   current. Requests are de-duplicated by id, so overlapping pages never show twice.
 * - Errors: exponential backoff (1 s, 2 s, 4 s ... max 30 s) with a visible "reconnecting" state;
 *   fatal answers (404/410) stop polling.
 * - Pauses while the tab is hidden or the user pauses; `refresh()` fetches immediately.
 */
import type { RequestSummaryDTO } from "./types";

export type LiveState = "live" | "paused" | "hidden" | "catching-up" | "reconnecting" | "stopped";

export type PollResult =
  | { status: 304 }
  | { status: 200; requests: RequestSummaryDTO[]; hasMore: boolean; etag: string | null };

export class PollFatalError extends Error {
  constructor(readonly status: number) {
    super(`poll failed with ${status}`);
  }
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LivePollerOptions {
  /** GET ...requests?after=<cursor>; throw PollFatalError for 404/410, any other error = transient. */
  fetchAfter(cursor: string | null, etag: string | null): Promise<PollResult>;
  /** New requests (deduplicated), newest first. */
  onNew(requests: RequestSummaryDTO[]): void;
  onState(state: LiveState, info: { failures: number; retryInMs: number | null }): void;
  onFatal?(err: PollFatalError): void;
  initialCursor: string | null;
  knownIds?: Iterable<string>;
  intervalMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  timers?: Timers;
}

const newer = (a: string, b: string | null) => b === null || BigInt(a) > BigInt(b);

export function backoffDelay(failures: number, base = 1000, max = 30_000): number {
  return Math.min(max, base * 2 ** Math.max(0, failures - 1));
}

export function createLivePoller(o: LivePollerOptions) {
  const timers: Timers = o.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  const interval = o.intervalMs ?? 2000;
  const seen = new Set<string>(o.knownIds ?? []);
  let cursor = o.initialCursor;
  let etag: string | null = null;
  let timer: unknown = null;
  let failures = 0;
  let paused = false;
  let hidden = false;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let again = false;

  const state = (s: LiveState, retryInMs: number | null = null) => o.onState(s, { failures, retryInMs });
  const idleState = () => (stopped ? "stopped" : paused ? "paused" : hidden ? "hidden" : "live");

  function clear() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }
  function schedule(ms: number) {
    clear();
    if (stopped || paused || hidden) {
      state(idleState());
      return;
    }
    timer = timers.setTimeout(() => {
      timer = null;
      void tick(false);
    }, ms);
  }

  async function run(): Promise<void> {
    try {
      const r = await o.fetchAfter(cursor, etag);
      if (stopped) return;
      failures = 0;
      if (r.status === 304) {
        state(idleState());
        schedule(interval);
        return;
      }
      etag = r.etag;
      const fresh: RequestSummaryDTO[] = [];
      for (const x of r.requests) {
        if (newer(x.cursor, cursor)) cursor = x.cursor;
        if (seen.has(x.id)) continue;
        seen.add(x.id);
        fresh.push(x);
      }
      if (seen.size > 20_000) {
        // Bound memory: ids older than the cursor can never come back from ?after=.
        const keep = [...seen].slice(-10_000);
        seen.clear();
        for (const id of keep) seen.add(id);
      }
      fresh.sort((a, b) => (BigInt(b.cursor) > BigInt(a.cursor) ? 1 : -1));
      if (fresh.length) o.onNew(fresh);
      if (r.hasMore) {
        state("catching-up");
        schedule(0);
      } else {
        state(idleState());
        schedule(interval);
      }
    } catch (err) {
      if (err instanceof PollFatalError) {
        stopped = true;
        clear();
        state("stopped");
        o.onFatal?.(err);
        return;
      }
      failures++;
      const delay = backoffDelay(failures, o.baseBackoffMs ?? 1000, o.maxBackoffMs ?? 30_000);
      clear();
      if (stopped) return;
      state("reconnecting", delay);
      if (!paused && !hidden) timer = timers.setTimeout(() => void tick(false), delay);
    }
  }

  async function tick(force: boolean): Promise<void> {
    if (stopped) return;
    if (!force && (paused || hidden)) return;
    if (inFlight) {
      again = true;
      return inFlight;
    }
    inFlight = run().finally(() => {
      inFlight = null;
      if (again) {
        again = false;
        void tick(true);
      }
    });
    return inFlight;
  }

  return {
    start() {
      stopped = false;
      schedule(0);
    },
    stop() {
      stopped = true;
      clear();
      state("stopped");
    },
    setPaused(v: boolean) {
      paused = v;
      if (v) {
        clear();
        state("paused");
      } else schedule(0);
    },
    setHidden(v: boolean) {
      hidden = v;
      if (v) {
        clear();
        state(idleState());
      } else schedule(0); // resume and catch up at once
    },
    /** Manual refresh: fetch now (even while paused), resetting any backoff. */
    refresh(): Promise<void> {
      failures = 0;
      clear();
      return tick(true);
    },
    /** Resolves when no request is in flight (tests). */
    async idle(): Promise<void> {
      while (inFlight) await inFlight;
    },
    get cursor() {
      return cursor;
    },
  };
}

export type LivePoller = ReturnType<typeof createLivePoller>;
