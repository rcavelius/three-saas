import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { backoffDelay, createLivePoller, PollFatalError, type LiveState, type PollResult, type Timers } from "@/lib/live-poller";
import type { RequestListDTO, RequestSummaryDTO } from "@/lib/types";
import { capture, createEndpoint, routes } from "./helpers";

beforeAll(async () => {
  await getDb();
});

/** Manual timers: nothing runs until the test fires it. */
function manualTimers() {
  const queue: { id: number; fn: () => void; ms: number }[] = [];
  let seq = 0;
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const id = ++seq;
      queue.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (h) => {
      const i = queue.findIndex((q) => q.id === h);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  return {
    timers,
    queue,
    /** Fires the next timer and returns its delay. */
    fire(): number | null {
      const next = queue.shift();
      if (!next) return null;
      next.fn();
      return next.ms;
    },
  };
}

/** fetchAfter backed by the real route handler (ETag/If-None-Match, ?after paging). */
function routeFetcher(endpointId: string, token: string, limit: number, statuses: number[]) {
  return async (cursor: string | null, etag: string | null): Promise<PollResult> => {
    const q = cursor ? `?after=${cursor}&limit=${limit}` : `?limit=${limit}`;
    const res = await routes.listRequests(endpointId, token, q, etag ? { "if-none-match": etag } : undefined);
    statuses.push(res.status);
    if (res.status === 304) return { status: 304 };
    if (res.status === 404 || res.status === 410) throw new PollFatalError(res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as RequestListDTO;
    return { status: 200, requests: body.requests, hasMore: Boolean(body.hasMore), etag: res.headers.get("etag") };
  };
}

describe("requests API: ETag and gapless ?after paging", () => {
  it("answers 304 to If-None-Match when nothing changed, 200 after a capture", async () => {
    const { endpoint, token } = await createEndpoint();
    await capture(endpoint.slug, "POST", { body: "1" });
    const first = await routes.listRequests(endpoint.id, token, "?after=0");
    const tag = first.headers.get("etag")!;
    expect(tag).toMatch(/^W\/"/);
    expect((await routes.listRequests(endpoint.id, token, "?after=0", { "if-none-match": tag })).status).toBe(304);
    await capture(endpoint.slug, "POST", { body: "2" });
    expect((await routes.listRequests(endpoint.id, token, "?after=0", { "if-none-match": tag })).status).toBe(200);
  });

  it("?after returns the oldest page after the cursor with hasMore, so paging catches up without gaps", async () => {
    const { endpoint, token } = await createEndpoint();
    for (let i = 1; i <= 7; i++) await capture(endpoint.slug, "POST", { path: `/p${i}` });
    const page = (await (await routes.listRequests(endpoint.id, token, "?after=0&limit=3")).json()) as RequestListDTO;
    expect(page.requests.map((r) => r.path)).toEqual(["/p3", "/p2", "/p1"]);
    expect(page.hasMore).toBe(true);
  });
});

describe("live poller", () => {
  it("pauses while hidden, then resumes and catches up every request exactly once, in order", async () => {
    const { endpoint, token } = await createEndpoint();
    await capture(endpoint.slug, "POST", { path: "/seed" });
    const initial = (await (await routes.listRequests(endpoint.id, token)).json()) as RequestListDTO;
    const t = manualTimers();
    const statuses: number[] = [];
    const received: RequestSummaryDTO[] = [];
    const states: LiveState[] = [];
    const poller = createLivePoller({
      fetchAfter: routeFetcher(endpoint.id, token, 10, statuses),
      onNew: (r) => received.push(...r),
      onState: (s) => states.push(s),
      initialCursor: initial.requests[0]!.cursor,
      knownIds: initial.requests.map((r) => r.id),
      timers: t.timers,
    });
    poller.setHidden(true);
    poller.start();
    expect(t.queue).toHaveLength(0); // hidden: nothing scheduled
    for (let i = 1; i <= 25; i++) await capture(endpoint.slug, "POST", { path: `/n${i}` });
    poller.setHidden(false);
    for (let guard = 0; guard < 10 && t.queue.length && t.queue[0]!.ms === 0; guard++) {
      t.fire();
      await poller.idle();
    }
    expect(states).toContain("catching-up");
    const paths = received.map((r) => r.path);
    expect(new Set(received.map((r) => r.id)).size).toBe(25); // no duplicates
    expect([...paths].sort()).toEqual(Array.from({ length: 25 }, (_, i) => `/n${i + 1}`).sort()); // no gaps
    const cursors = received.map((r) => BigInt(r.cursor));
    for (let i = 1; i < cursors.length; i++) {
      // each catch-up page arrives newest-first; pages go forward in time
      if (cursors[i]! > cursors[i - 1]!) expect(i % 10).toBe(0);
    }
    // Up to date: polls now use the regular interval; the first one at the new cursor is an empty
    // 200 (new query string), every following unchanged poll is a 304.
    expect(t.queue[0]!.ms).toBe(2000);
    t.fire();
    await poller.idle();
    t.fire();
    await poller.idle();
    t.fire();
    await poller.idle();
    expect(statuses.slice(-2)).toEqual([304, 304]);
    expect(received).toHaveLength(25);
    poller.stop();
  });

  it("backs off exponentially on errors with a visible reconnecting state, then recovers without losing requests", async () => {
    const t = manualTimers();
    const states: { s: LiveState; retry: number | null }[] = [];
    let failuresLeft = 4;
    const item = (n: number): RequestSummaryDTO => ({
      id: `id-${n}`,
      cursor: String(n),
      method: "POST",
      path: `/x${n}`,
      query: "",
      contentType: null,
      bodySize: 0,
      truncated: false,
      sourceIp: null,
      receivedAt: new Date().toISOString(),
    });
    const got: string[] = [];
    const poller = createLivePoller({
      fetchAfter: async (cursor) => {
        if (failuresLeft-- > 0) throw new Error("network down");
        const after = Number(cursor ?? 0);
        // Server overlaps one already-seen item: must be de-duplicated.
        const reqs = [item(after + 2), item(after + 1), item(after)].filter((r) => Number(r.cursor) > 0);
        return { status: 200, requests: reqs, hasMore: false, etag: null };
      },
      onNew: (r) => got.push(...r.map((x) => x.id)),
      onState: (s, i) => states.push({ s, retry: i.retryInMs }),
      initialCursor: "10",
      knownIds: ["id-10"],
      timers: t.timers,
    });
    poller.start();
    const delays: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      delays.push(t.fire());
      await poller.idle();
    }
    expect(delays).toEqual([0, 1000, 2000, 4000, 8000]);
    expect(states.filter((x) => x.s === "reconnecting").map((x) => x.retry)).toEqual([1000, 2000, 4000, 8000]);
    expect(states.at(-1)!.s).toBe("live");
    expect(got).toEqual(["id-12", "id-11"]);
    expect(backoffDelay(10)).toBe(30_000);
    poller.stop();
  });

  it("manual refresh fetches immediately even while paused; fatal 404 stops polling", async () => {
    const t = manualTimers();
    let calls = 0;
    let fatal = false;
    const poller = createLivePoller({
      fetchAfter: async () => {
        calls++;
        if (calls === 2) throw new PollFatalError(404);
        return { status: 304 };
      },
      onNew: () => undefined,
      onState: () => undefined,
      onFatal: () => {
        fatal = true;
      },
      initialCursor: null,
      timers: t.timers,
    });
    poller.setPaused(true);
    poller.start();
    expect(t.queue).toHaveLength(0);
    await poller.refresh();
    expect(calls).toBe(1);
    await poller.refresh();
    expect(fatal).toBe(true);
    poller.setPaused(false);
    expect(t.queue).toHaveLength(0);
  });
});
