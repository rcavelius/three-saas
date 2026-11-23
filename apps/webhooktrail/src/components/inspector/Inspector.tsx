"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { timeUntil } from "@/lib/format";
import { createLivePoller, PollFatalError, type LivePoller, type LiveState, type PollResult } from "@/lib/live-poller";
import type { PaywallReason } from "@/lib/analytics-events";
import {
  CAPTURE_METHODS,
  type EndpointDTO,
  type PassStatusDTO,
  type RequestDetailDTO,
  type RequestListDTO,
  type RequestSummaryDTO,
} from "@/lib/types";
import { CreateEndpointButton } from "../CreateEndpointButton";
import { PassPaywall } from "../pass/PassPaywall";
import { PassActiveNote } from "../pass/PassStatus";
import { CopyButton } from "../ui";
import { EndpointSettings } from "./EndpointSettings";
import { RequestDetail } from "./RequestDetail";
import { RequestList } from "./RequestList";
import { TestPayloads } from "./TestPayloads";

const LIVE_LABEL: Record<LiveState, string> = {
  live: "LIVE",
  paused: "PAUSED",
  hidden: "LIVE (tab hidden)",
  "catching-up": "CATCHING UP",
  reconnecting: "RECONNECTING",
  stopped: "STOPPED",
};

const RANGES: Record<string, number> = { "15m": 15 * 60_000, "1h": 3_600_000, "24h": 86_400_000 };

type Load = "loading" | "ready" | "notfound" | "expired" | "error";
type Pane = "request" | "test" | "settings";

interface Filters {
  method: string;
  q: string;
  range: string;
}

function buildQuery(f: Filters, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  if (f.method) sp.set("method", f.method);
  if (f.q.trim()) sp.set("q", f.q.trim().slice(0, 200));
  if (f.range && RANGES[f.range]) sp.set("from", new Date(Date.now() - RANGES[f.range]!).toISOString());
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function curlExample(url: string) {
  return `curl -X POST '${url}/hello?source=curl' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"event":"ping","ok":true}'`;
}

export function Inspector({ endpointId }: { endpointId: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>("loading");
  const [endpoint, setEndpoint] = useState<EndpointDTO | null>(null);
  const [requests, setRequests] = useState<RequestSummaryDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({ method: "", q: "", range: "" });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RequestDetailDTO>>({});
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("request");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [live, setLive] = useState(true);
  const [visible, setVisible] = useState(true);
  const [announce, setAnnounce] = useState("");
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [listError, setListError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState>("live");
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [pass, setPass] = useState<PassStatusDTO | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  const requestsRef = useRef(requests);
  requestsRef.current = requests;
  const effFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
  const filtersRef = useRef(effFilters);
  filtersRef.current = effFilters;
  const pollerRef = useRef<LivePoller | null>(null);

  const loadEndpoint = useCallback(async () => {
    try {
      const r = await api<{ endpoint: EndpointDTO; signedIn?: boolean; pass?: PassStatusDTO | null }>(`/api/endpoints/${endpointId}`);
      setSignedIn(Boolean(r.signedIn));
      setPass(r.pass ?? null);
      setEndpoint(r.endpoint);
      setLoad(r.endpoint.expired ? "expired" : "ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setLoad("notfound");
      else if (e instanceof ApiError && e.status === 410) setLoad("expired");
      else setLoad("error");
    }
  }, [endpointId]);

  useEffect(() => {
    void loadEndpoint();
  }, [loadEndpoint]);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  // First page whenever the filters change.
  useEffect(() => {
    if (load !== "ready") return;
    const ctrl = new AbortController();
    setListLoading(true);
    setListError(null);
    api<RequestListDTO>(`/api/endpoints/${endpointId}/requests${buildQuery(effFilters)}`, { signal: ctrl.signal })
      .then((r) => {
        setRequests(r.requests);
        setNextCursor(r.nextCursor);
        setSelectedId((cur) => (cur && r.requests.some((x) => x.id === cur) ? cur : (r.requests[0]?.id ?? null)));
        setListLoading(false);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        if (e instanceof ApiError && e.status === 410) setLoad("expired");
        setListError(e instanceof ApiError ? e.message : "Could not load requests.");
        setListLoading(false);
      });
    return () => ctrl.abort();
  }, [endpointId, effFilters, load]);

  // Visibility: polling pauses while the tab is hidden.
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Relative timestamps tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  /** One poll: ?after=<cursor> with If-None-Match (304 = nothing new). */
  const fetchAfter = useCallback(
    async (cursor: string | null, etag: string | null): Promise<PollResult> => {
      const q = buildQuery(filtersRef.current, { after: cursor ?? "0", limit: "100" });
      const res = await fetch(`/api/endpoints/${endpointId}/requests${q}`, {
        headers: etag ? { "If-None-Match": etag } : undefined,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 304) return { status: 304 };
      if (res.status === 404 || res.status === 410) throw new PollFatalError(res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as RequestListDTO;
      return { status: 200, requests: body.requests, hasMore: Boolean(body.hasMore), etag: res.headers.get("etag") };
    },
    [endpointId],
  );

  // Live polling (gapless, deduplicated, backoff on errors). Recreated whenever the list reloads.
  useEffect(() => {
    if (load !== "ready" || listLoading) return;
    const current = requestsRef.current;
    const poller = createLivePoller({
      fetchAfter,
      initialCursor: current[0]?.cursor ?? null,
      knownIds: current.map((r) => r.id),
      onState: (s, info) => {
        setLiveState(s);
        setRetryIn(info.retryInMs);
      },
      onFatal: () => void loadEndpoint(),
      onNew: (added) => {
        setRequests((cur) => {
          const known = new Set(cur.map((x) => x.id));
          return [...added.filter((a) => !known.has(a.id)), ...cur];
        });
        setSelectedId((cur) => cur ?? added[0]!.id);
        setFreshIds(new Set(added.map((a) => a.id)));
        setAnnounce(`${added.length} new request${added.length === 1 ? "" : "s"} captured`);
        void loadEndpoint();
      },
    });
    pollerRef.current = poller;
    poller.setHidden(document.visibilityState !== "visible");
    poller.setPaused(!live);
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- live/visible are pushed in by the effects below
  }, [load, listLoading, fetchAfter, loadEndpoint]);

  useEffect(() => {
    pollerRef.current?.setHidden(!visible);
  }, [visible]);
  useEffect(() => {
    pollerRef.current?.setPaused(!live);
  }, [live]);

  const poll = useCallback(() => pollerRef.current?.refresh(), []);

  async function claim() {
    setClaimMsg(null);
    try {
      const r = await api<{ claimed: number; skipped: number }>("/api/endpoints/claim", { method: "POST", body: {} });
      setClaimMsg(
        r.skipped > 0
          ? `Claimed ${r.claimed}; ${r.skipped} could not be claimed because your plan's endpoint limit is reached.`
          : `Claimed ${r.claimed} endpoint${r.claimed === 1 ? "" : "s"} into your workspace.`,
      );
      void loadEndpoint();
    } catch (e) {
      setClaimMsg(e instanceof ApiError ? e.message : "Could not claim endpoints.");
    }
  }

  // Load the selected request's detail.
  useEffect(() => {
    if (!selectedId || details[selectedId]) return;
    let cancelled = false;
    setDetailError(null);
    api<{ request: RequestDetailDTO }>(`/api/endpoints/${endpointId}/requests/${selectedId}`)
      .then((r) => {
        if (!cancelled) setDetails((d) => ({ ...d, [selectedId]: r.request }));
      })
      .catch((e) => {
        if (!cancelled) setDetailError(e instanceof ApiError ? e.message : "Could not load this request.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, details, endpointId]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await api<RequestListDTO>(`/api/endpoints/${endpointId}/requests${buildQuery(effFilters, { before: nextCursor })}`);
      setRequests((cur) => [...cur, ...r.requests.filter((x) => !cur.some((c) => c.id === x.id))]);
      setNextCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function deleteSelected() {
    if (!selectedId) return;
    const idx = requests.findIndex((r) => r.id === selectedId);
    try {
      await api(`/api/endpoints/${endpointId}/requests/${selectedId}`, { method: "DELETE" });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) return;
    }
    const rest = requests.filter((r) => r.id !== selectedId);
    setRequests(rest);
    setSelectedId(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    setAnnounce("Request deleted");
    void loadEndpoint();
  }

  async function clearAll() {
    await api(`/api/endpoints/${endpointId}/requests`, { method: "DELETE" });
    setRequests([]);
    setNextCursor(null);
    setSelectedId(null);
    setDetails({});
    setConfirmClear(false);
    setAnnounce("All requests cleared");
    void loadEndpoint();
  }

  if (load === "loading") {
    return <p className="p-6 font-mono text-[13px] text-fg-dim">Loading endpoint…</p>;
  }
  if (load === "notfound" || load === "error" || (load === "expired" && !endpoint)) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">{load === "error" ? "Something went wrong" : load === "expired" ? "Endpoint expired" : "Endpoint not found"}</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          {load === "error"
            ? "The endpoint could not be loaded. Try again in a moment."
            : load === "expired"
              ? "This endpoint has expired. Its requests are deleted by the next cleanup run."
              : "It may have been deleted or expired, or it was created in a different browser. Anonymous endpoints belong to the browser that created them."}
        </p>
        <div className="mt-6">
          <CreateEndpointButton size="sm" />
        </div>
      </div>
    );
  }
  if (load === "expired" && endpoint) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">“{endpoint.name}” has expired</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          Its capture URL now answers <span className="font-mono">410 Gone</span> and its requests are deleted by the next cleanup run.
        </p>
        {!endpoint.permissions.replayIncluded && !pass && <PassPaywall className="mt-6" reason="expired" />}
        <div className="mt-6 flex gap-3">
          <CreateEndpointButton size="sm" />
          <Link className="btn" href="/">
            Back to start
          </Link>
        </div>
      </div>
    );
  }

  const ep = endpoint!;
  // Free owner without a pass: the pass is the upgrade we offer at the limits (paid plans include replay).
  const offerPass = !ep.permissions.replayIncluded && !pass;
  const storedFull = ep.storedCount >= ep.maxRequests;
  const selected = selectedId ? details[selectedId] : undefined;
  const filtered = Boolean(effFilters.method || effFilters.q || effFilters.range);
  const liveOn = live && visible;

  return (
    <div className="flex-1 flex flex-col min-h-0 h-[calc(100dvh-3rem-3.25rem)] min-h-[560px]">
      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>
      {liveState === "reconnecting" && (
        <p role="status" className="border-b border-warn/40 bg-warn/5 px-4 py-1.5 text-[12.5px] text-warn">
          Connection problem: reconnecting{retryIn ? ` in ${Math.ceil(retryIn / 1000)} s` : ""}. Requests captured meanwhile will appear once
          the connection is back.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => void poll()}>
            Retry now
          </button>
        </p>
      )}
      {ep.locked && (
        <p role="status" className="border-b border-err/40 bg-err/5 px-4 py-1.5 text-[12.5px] text-err">
          {ep.owner === "org"
            ? "Paused: your workspace's plan covers fewer endpoints than it has,"
            : "Paused: the free plan covers fewer endpoints than this browser has,"}{" "}
          so this one answers 423 and stores nothing. Its history is kept.{" "}
          {ep.owner === "org" && (
            <>
              <Link className="underline underline-offset-2" href="/account/billing">
                Upgrade
              </Link>
              {", "}
            </>
          )}
          {offerPass && (
            <>
              <button type="button" className="underline underline-offset-2" onClick={() => setPaywall("locked")}>
                get the 7-day pass
              </button>{" "}
            </>
          )}
          or delete another endpoint.
        </p>
      )}
      {claimMsg && (
        // Outside the anonymous banner, which disappears once the endpoint belongs to the workspace.
        <p role="status" className="border-b border-line bg-surface-2 px-4 py-1.5 text-[12.5px] text-fg-muted">
          {claimMsg}
        </p>
      )}
      {ep.owner === "anonymous" && (
        <div className="border-b border-line bg-surface-2 px-4 py-1.5 text-[12.5px] text-fg-muted flex flex-wrap items-center gap-2">
          <span>This endpoint belongs to this browser only and expires.</span>
          {signedIn ? (
            <button type="button" className="underline underline-offset-2 text-signal" onClick={() => void claim()}>
              Claim my anonymous endpoints into my workspace
            </button>
          ) : (
            <span>
              <Link className="underline underline-offset-2 text-signal" href="/signup">
                Sign up
              </Link>{" "}
              or{" "}
              <Link className="underline underline-offset-2 text-signal" href={`/login?next=${encodeURIComponent(`/e/${ep.id}`)}`}>
                log in
              </Link>{" "}
              to keep it in a workspace.
            </span>
          )}
        </div>
      )}

      {pass && (
        <div className="border-b border-line bg-surface-2 px-4 py-1.5">
          <PassActiveNote pass={pass} />
        </div>
      )}
      {paywall && offerPass && (
        <div className="border-b border-line px-4 py-3">
          <PassPaywall reason={paywall} onClose={() => setPaywall(null)} className="max-w-2xl" />
        </div>
      )}

      {/* Endpoint toolbar */}
      <div className="border-b border-line bg-surface px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[15px] font-semibold truncate max-w-[16rem]" title={ep.name}>
          {ep.name}
        </h1>
        <div className="flex items-center gap-2 min-w-0 flex-1 basis-[22rem]">
          <label htmlFor="capture-url" className="label shrink-0">
            URL
          </label>
          <input
            id="capture-url"
            readOnly
            value={ep.captureUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="field font-mono text-[12.5px] flex-1 min-w-0 text-signal"
          />
          <CopyButton text={ep.captureUrl} ariaLabel="Copy capture URL" />
        </div>
        <div className="flex items-center gap-4 font-mono text-[11.5px] text-fg-muted">
          <span>
            <span className={`tabular-nums ${storedFull ? "text-warn" : "text-fg"}`}>{ep.storedCount}</span>/{ep.maxRequests} stored
            {storedFull && offerPass && (
              <>
                {" "}
                <button type="button" className="text-signal underline underline-offset-2" onClick={() => setPaywall("stored_limit")}>
                  keep more
                </button>
              </>
            )}
          </span>
          {ep.expiresAt ? (
            <span title={new Date(ep.expiresAt).toLocaleString()}>
              expires <span className="text-fg">{timeUntil(ep.expiresAt, now)}</span>
              {offerPass && (
                <>
                  {" "}
                  <button type="button" className="text-signal underline underline-offset-2" onClick={() => setPaywall("expiry")}>
                    keep 7 days
                  </button>
                </>
              )}
            </span>
          ) : (
            <span>no expiry</span>
          )}
          <button
            type="button"
            aria-pressed={live}
            onClick={() => setLive((v) => !v)}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-[3px] border border-line-strong hover:bg-surface-3"
            title={live ? "Pause live updates" : "Resume live updates"}
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${liveState === "reconnecting" ? "bg-warn" : liveOn ? "bg-ok wt-pulse" : "bg-fg-dim"}`}
            />
            {live ? LIVE_LABEL[liveState] : "PAUSED"}
          </button>
          <button type="button" className="btn btn-ghost h-7" onClick={() => void poll()} title="Fetch new requests now">
            Refresh
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn h-7 ${pane === "test" ? "border-signal text-signal" : ""}`}
            aria-pressed={pane === "test"}
            onClick={() => {
              setPane(pane === "test" ? "request" : "test");
              setMobileDetail(true);
            }}
          >
            Send test
          </button>
          <button
            type="button"
            className={`btn h-7 ${pane === "settings" ? "border-signal text-signal" : ""}`}
            aria-pressed={pane === "settings"}
            onClick={() => {
              setPane(pane === "settings" ? "request" : "settings");
              setMobileDetail(true);
            }}
          >
            Settings
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(320px,400px)_1fr]">
        {/* List column */}
        <section
          aria-label="Requests"
          className={`min-h-0 flex-col border-r border-line bg-bg ${mobileDetail ? "hidden md:flex" : "flex"}`}
        >
          <form role="search" className="p-2 border-b border-line grid grid-cols-[1fr_auto_auto] gap-1.5" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="req-search" className="sr-only">
              Search path, headers and body
            </label>
            <input
              id="req-search"
              type="search"
              className="field min-w-0"
              placeholder="Search requests"
              value={filters.q}
              maxLength={200}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
            <label htmlFor="req-method" className="sr-only">
              Method
            </label>
            <select
              id="req-method"
              className="field font-mono text-[12px]"
              value={filters.method}
              onChange={(e) => setFilters((f) => ({ ...f, method: e.target.value }))}
            >
              <option value="">ANY</option>
              {CAPTURE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label htmlFor="req-range" className="sr-only">
              Time range
            </label>
            <select
              id="req-range"
              className="field font-mono text-[12px]"
              value={filters.range}
              onChange={(e) => setFilters((f) => ({ ...f, range: e.target.value }))}
            >
              <option value="">all time</option>
              <option value="15m">15 min</option>
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
            </select>
          </form>
          <div className="px-3 py-1.5 border-b border-line flex items-center gap-2 font-mono text-[11px] text-fg-dim">
            <span>
              {requests.length}
              {nextCursor ? "+" : ""} {filtered ? "matching" : "shown"}
            </span>
            {filtered && (
              <button type="button" className="underline underline-offset-2 hover:text-fg" onClick={() => setFilters({ method: "", q: "", range: "" })}>
                clear filters
              </button>
            )}
            <span className="ml-auto hidden lg:inline">
              <span className="kbd">↑</span> <span className="kbd">↓</span> navigate
            </span>
            {requests.length > 0 &&
              (confirmClear ? (
                <span className="flex gap-1">
                  <button type="button" className="text-err underline underline-offset-2" onClick={() => void clearAll()}>
                    confirm clear all
                  </button>
                  <button type="button" className="underline underline-offset-2" onClick={() => setConfirmClear(false)}>
                    cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="hover:text-err underline underline-offset-2 ml-auto lg:ml-0" onClick={() => setConfirmClear(true)}>
                  clear all
                </button>
              ))}
          </div>
          {listError && <p className="p-3 text-[12.5px] text-err">{listError}</p>}
          {listLoading ? (
            <p className="p-3 font-mono text-[12px] text-fg-dim">Loading…</p>
          ) : requests.length === 0 ? (
            <div className="p-4 text-[13px] text-fg-muted">
              {filtered ? (
                "No requests match these filters."
              ) : (
                <p className="flex items-center gap-2 font-mono text-[12px]">
                  <span aria-hidden className={`size-2 rounded-full ${liveOn ? "bg-signal wt-pulse" : "bg-fg-dim"}`} />
                  Waiting for the first request…
                </p>
              )}
            </div>
          ) : (
            <RequestList
              requests={requests}
              selectedId={selectedId}
              freshIds={freshIds}
              now={now}
              onSelect={(id) => {
                setSelectedId(id);
                setPane("request");
              }}
              onOpen={() => setMobileDetail(true)}
              hasMore={Boolean(nextCursor)}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMore()}
            />
          )}
        </section>

        {/* Detail column */}
        <section aria-label="Details" className={`min-h-0 overflow-y-auto bg-surface ${mobileDetail ? "block" : "hidden md:block"}`}>
          <div className="md:hidden border-b border-line px-2 py-1.5">
            <button type="button" className="btn btn-ghost h-7" onClick={() => setMobileDetail(false)}>
              ← Requests
            </button>
          </div>
          {pane === "test" ? (
            <TestPayloads captureUrl={ep.captureUrl} onSent={() => void poll()} />
          ) : pane === "settings" ? (
            <EndpointSettings
              endpoint={ep}
              onUpdated={setEndpoint}
              onDeleted={() => {
                router.push("/");
              }}
            />
          ) : requests.length === 0 && !listLoading && !filtered ? (
            <div className="p-6 max-w-2xl">
              <h2 className="text-[17px] font-semibold">Your endpoint is live</h2>
              <p className="mt-1 text-[13.5px] text-fg-muted">
                Point a webhook at the URL above, or run this. Any method and any sub-path work; requests appear here within about two
                seconds.
              </p>
              <pre className="mt-4 p-4 bg-bg border border-line rounded-[4px] font-mono text-[12.5px] leading-relaxed overflow-x-auto">
                {curlExample(ep.captureUrl)}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={curlExample(ep.captureUrl)} label="Copy curl command" className="btn btn-signal" />
                <button type="button" className="btn" onClick={() => setPane("test")}>
                  Send a test payload from the browser
                </button>
              </div>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-[12px] max-w-md">
                <dt className="text-fg-dim">stored body</dt>
                <dd>first {Math.round(ep.limits.storedBodyBytes / 1024)} KB</dd>
                <dt className="text-fg-dim">rejected above</dt>
                <dd>{Math.round(ep.limits.maxBodyBytes / 1024 / 1024)} MB (413)</dd>
                <dt className="text-fg-dim">history</dt>
                <dd>newest {ep.maxRequests} requests</dd>
                <dt className="text-fg-dim">reply</dt>
                <dd>
                  {ep.response.status} {ep.response.contentType}
                </dd>
              </dl>
            </div>
          ) : selected ? (
            <RequestDetail
              key={selected.id}
              request={selected}
              captureUrl={ep.captureUrl}
              endpoint={ep}
              onDelete={() => void deleteSelected()}
              now={now}
            />
          ) : detailError ? (
            <p className="p-4 text-[13px] text-err">{detailError}</p>
          ) : selectedId ? (
            <p className="p-4 font-mono text-[12px] text-fg-dim">Loading request…</p>
          ) : (
            <p className="p-4 text-[13px] text-fg-dim">Select a request.</p>
          )}
        </section>
      </div>
    </div>
  );
}
