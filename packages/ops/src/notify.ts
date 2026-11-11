/**
 * Owner notification policy (run as the `ops.notify_owner` job every minute):
 *  - critical: email immediately, at most once per fingerprint per 6 h (tracked in incidents.notified_at
 *    across every incident row with that fingerprint, so resolve/re-open cannot bypass the throttle).
 *  - warning: one digest per day (first run after `digestHourUtc`), listing open warnings only.
 *  - info: never emailed (dashboard only).
 * Without an owner address, nothing is sent; incidents are still stored and heartbeat
 * `owner-notify` records "owner email not configured" so the dashboard can show it.
 */
import { alertEmail, renderBrandedEmail } from "./email";
import { listOpenIncidents } from "./incidents";
import type { Mailer } from "./mailer";
import { getSetting, setSetting, writeHeartbeat } from "./state";
import type { Brand, SqlExecutor } from "./types";

export const CRITICAL_RENOTIFY_MS = 6 * 3600_000;
const DIGEST_KEY = "owner_digest_last_sent_at";

export interface NotifyOwnerOptions {
  mailer: Pick<Mailer, "send">;
  brand: Brand;
  /** OWNER_ALERT_EMAIL. */
  ownerEmail?: string;
  dashboardUrl?: string;
  now?: Date;
  /** UTC hour after which the daily warning digest goes out (default 8). */
  digestHourUtc?: number;
}

export interface NotifyResult {
  ownerEmailConfigured: boolean;
  criticalSent: string[];
  criticalThrottled: string[];
  digestSent: boolean;
  digestCount: number;
}

export async function notifyOwner(ex: SqlExecutor, opts: NotifyOwnerOptions): Promise<NotifyResult> {
  const now = opts.now ?? new Date();
  const owner = opts.ownerEmail?.trim();
  const result: NotifyResult = {
    ownerEmailConfigured: Boolean(owner),
    criticalSent: [],
    criticalThrottled: [],
    digestSent: false,
    digestCount: 0,
  };
  const criticals = await listOpenIncidents(ex, { severity: "critical" });

  if (!owner) {
    await writeHeartbeat(
      ex,
      "owner-notify",
      { ownerEmailConfigured: false, note: "owner email not configured", openCritical: criticals.length },
      now,
    );
    return result;
  }

  for (const inc of criticals) {
    const key = inc.fingerprint ?? inc.id;
    const { rows } = await ex.query<{ last: Date | null }>(
      `SELECT max(notified_at) AS last FROM incidents WHERE (fingerprint = $1 OR id::text = $1)`,
      [key],
    );
    const last = rows[0]?.last ? new Date(rows[0].last) : null;
    if (last && now.getTime() - last.getTime() < CRITICAL_RENOTIFY_MS) {
      result.criticalThrottled.push(key);
      continue;
    }
    await opts.mailer.send(
      alertEmail(opts.brand, {
        to: owner,
        title: inc.title,
        severity: "critical",
        summary: `A critical incident is open in ${opts.brand.name} (source: ${inc.source}).`,
        facts: {
          Occurrences: inc.occurrences,
          "First seen": new Date(inc.created_at).toISOString(),
          "Last seen": new Date(inc.last_seen_at).toISOString(),
          Fingerprint: key,
        },
        dashboardUrl: opts.dashboardUrl,
      }),
    );
    await ex.query(`UPDATE incidents SET notified_at = $2 WHERE id = $1`, [inc.id, now.toISOString()]);
    result.criticalSent.push(key);
  }

  const hour = opts.digestHourUtc ?? 8;
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
  const lastDigestRaw = await getSetting<string>(ex, DIGEST_KEY);
  const lastDigest = lastDigestRaw ? new Date(lastDigestRaw) : null;
  if (now >= slot && (!lastDigest || lastDigest < slot)) {
    const warnings = await listOpenIncidents(ex, { severity: "warning" });
    result.digestCount = warnings.length;
    if (warnings.length > 0) {
      const lines = warnings.map(
        (w) =>
          `${w.title} (source: ${w.source}; ${w.occurrences} occurrence${w.occurrences === 1 ? "" : "s"}; last seen ${new Date(w.last_seen_at).toISOString()})`,
      );
      const { html, text } = renderBrandedEmail(opts.brand, {
        heading: `${warnings.length} open warning${warnings.length === 1 ? "" : "s"}`,
        paragraphs: ["These warnings are open. None is critical; review them when convenient.", ...lines],
        action: opts.dashboardUrl ? { label: "Open ops dashboard", url: opts.dashboardUrl } : undefined,
        footer: `Daily digest for ${opts.brand.name}. Critical incidents are emailed separately and immediately.`,
      });
      await opts.mailer.send({
        to: owner,
        subject: `[${opts.brand.name}] Daily digest: ${warnings.length} open warning${warnings.length === 1 ? "" : "s"}`,
        html,
        text,
        tag: "owner_digest",
      });
      result.digestSent = true;
    }
    await setSetting(ex, DIGEST_KEY, now.toISOString(), now);
  }

  await writeHeartbeat(
    ex,
    "owner-notify",
    {
      ownerEmailConfigured: true,
      openCritical: criticals.length,
      criticalSent: result.criticalSent.length,
      digestSent: result.digestSent,
    },
    now,
  );
  return result;
}
