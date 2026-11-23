/**
 * The free plan's download fence: preview and clean anything within the processing limits, but a cleaned
 * download is free only up to `downloadRows` rows, `downloadsPerDay` times per UTC day.
 *
 * Honest framing, as for every limit in limits.ts: files are cleaned and exported in this browser and never
 * uploaded, so the server never sees a download. The daily count lives in this browser's localStorage, which
 * makes it a value fence, not a security boundary (clearing site data resets it). Paid plans and an active
 * pass have -1 = unlimited. Every storage access is guarded: blocked storage must never break a download.
 */

export const DOWNLOAD_COUNT_KEY = "gridrinse.downloads.v1";

export type DownloadBlock = "download_rows" | "download_daily";

export interface DownloadLimits {
  /** -1 = unlimited. */
  downloadRows: number;
  /** -1 = unlimited. */
  downloadsPerDay: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** Cleaned downloads already made in this browser today (UTC). 0 when storage is unavailable. */
export function downloadsToday(now: Date = new Date(), store: StorageLike | null = storage()): number {
  try {
    const raw = store?.getItem(DOWNLOAD_COUNT_KEY);
    if (!raw) return 0;
    const v = JSON.parse(raw) as { day?: unknown; count?: unknown };
    if (v.day !== utcDay(now) || typeof v.count !== "number" || !Number.isFinite(v.count)) return 0;
    return Math.max(0, Math.floor(v.count));
  } catch {
    return 0;
  }
}

/** Counts one cleaned download for today (UTC). */
export function recordDownload(now: Date = new Date(), store: StorageLike | null = storage()): void {
  try {
    store?.setItem(DOWNLOAD_COUNT_KEY, JSON.stringify({ day: utcDay(now), count: downloadsToday(now, store) + 1 }));
  } catch {
    /* storage blocked: nothing to count with */
  }
}

/**
 * Whether a cleaned download of `rows` rows may go ahead. The built-in sample files are always downloadable
 * (they are small and are the demo) and never count.
 */
export function checkDownload(o: { rows: number; limits: DownloadLimits; usedToday: number; sample?: boolean }): { ok: true } | { ok: false; reason: DownloadBlock } {
  if (o.sample) return { ok: true };
  if (o.limits.downloadRows >= 0 && o.rows > o.limits.downloadRows) return { ok: false, reason: "download_rows" };
  if (o.limits.downloadsPerDay >= 0 && o.usedToday >= o.limits.downloadsPerDay) return { ok: false, reason: "download_daily" };
  return { ok: true };
}

/** Whether a download under these limits counts towards the daily allowance. */
export const countsTowardsDaily = (limits: DownloadLimits, sample?: boolean) => !sample && limits.downloadsPerDay >= 0;
