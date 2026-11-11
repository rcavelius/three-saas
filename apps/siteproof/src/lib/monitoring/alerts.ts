/**
 * Alert delivery: pending `alerts` rows -> one email per recipient through the ops mailer (outbox).
 * Rules: plan feature `emailAlerts` required; per-site mute; recipients are org members only (the
 * stored list is re-checked against auth_member at send time; empty list = every member).
 */
import type { Billing } from "@repo/billing";
import type { DbHandle, SqlExecutor } from "@repo/database";
import { renderBrandedEmail, type Brand, type EmailMessage, type Mailer } from "@repo/ops";

export interface AlertDetails {
  siteUrl: string;
  events: { kind: string; summary: string; issues: { message: string; page: string | null; severity: string }[] }[];
}

export function siteAlertEmail(
  brand: Brand,
  d: { to: string; kind: string; title: string; details: AlertDetails; siteUrl: string; dashboardUrl: string; workspace: string },
): EmailMessage {
  const host = (() => {
    try {
      return new URL(d.siteUrl).host;
    } catch {
      return d.siteUrl;
    }
  })();
  const paragraphs: string[] = [];
  for (const e of d.details.events) {
    paragraphs.push(e.summary);
    for (const i of e.issues.slice(0, 10)) paragraphs.push(`- ${i.message}${i.page ? ` (on ${i.page})` : ""}`);
    if (e.issues.length > 10) paragraphs.push(`...and ${e.issues.length - 10} more in the dashboard.`);
  }
  const { html, text } = renderBrandedEmail(brand, {
    heading: `${host}: ${d.title}`,
    paragraphs,
    action: { label: "Open the site in SiteProof", url: d.dashboardUrl },
    footer: `You receive this because you are a member of ${d.workspace} and alerts are on for ${host}. You can mute alerts for this site or change who receives them on its dashboard page.`,
  });
  const subject = d.kind === "resolved" ? `[${brand.name}] Fixed on ${host}: ${d.title}` : `[${brand.name}] ${host}: ${d.title}`;
  return { to: d.to, subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200), text, html, tag: `site_alert_${d.kind}` };
}

interface PendingAlert {
  id: string;
  org_id: string;
  site_id: string;
  kind: string;
  title: string;
  details: AlertDetails | string;
}

export interface DispatchDeps {
  handle: DbHandle<any>;
  billing: Billing;
  mailer: Mailer;
  appUrl: string;
  now?: () => Date;
}

async function recipientsFor(ex: SqlExecutor, orgId: string, chosen: string[]): Promise<{ userId: string; email: string }[]> {
  const { rows } = await ex.query<{ user_id: string; email: string; email_verified: boolean }>(
    `SELECT m.user_id, u.email, u.email_verified FROM auth_member m JOIN auth_user u ON u.id = m.user_id
     WHERE m.organization_id = $1 ORDER BY m.created_at`,
    [orgId],
  );
  const verified = rows.filter((r) => r.email_verified);
  const list = chosen.length ? verified.filter((r) => chosen.includes(r.user_id)) : verified;
  return list.map((r) => ({ userId: r.user_id, email: r.email }));
}

/** Sends pending alerts (optionally only for one site). Returns the number of emails queued. */
export async function dispatchPendingAlerts(d: DispatchDeps, opts: { siteId?: string; limit?: number } = {}): Promise<number> {
  const ex = d.handle.executor;
  const now = (d.now ?? (() => new Date()))();
  // Rows stuck in 'sending' (crash between claim and send) go back to pending after 10 minutes.
  await ex.query(`UPDATE alerts SET status = 'pending' WHERE status = 'sending' AND created_at < $1`, [new Date(now.getTime() - 10 * 60_000).toISOString()]);
  const { rows } = await ex.query<PendingAlert>(
    `UPDATE alerts SET status = 'sending' WHERE id IN (
       SELECT id FROM alerts WHERE status = 'pending' AND ($1::uuid IS NULL OR site_id = $1::uuid)
       ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)
     RETURNING id::text AS id, org_id, site_id::text AS site_id, kind, title, details`,
    [opts.siteId ?? null, opts.limit ?? 50],
  );
  let sent = 0;
  for (const a of rows) {
    const details = typeof a.details === "string" ? (JSON.parse(a.details) as AlertDetails) : a.details;
    const setStatus = (status: string, recipients: string[] = []) =>
      ex.query(`UPDATE alerts SET status = $2, recipients = $3::text[], emailed_at = $4 WHERE id = $1`, [
        a.id,
        status,
        recipients,
        status === "sent" ? now.toISOString() : null,
      ]);
    try {
      const { rows: s } = await ex.query<{ url: string; alerts_muted: boolean; alert_recipients: string[]; org_name: string }>(
        `SELECT s.url, s.alerts_muted, s.alert_recipients, o.name AS org_name FROM sites s
         JOIN auth_organization o ON o.id = s.org_id WHERE s.id = $1 AND s.org_id = $2`,
        [a.site_id, a.org_id],
      );
      const site = s[0];
      if (!site) {
        await setStatus("dropped");
        continue;
      }
      const ents = await d.billing.getEntitlements(a.org_id);
      if (!ents.features.emailAlerts) {
        await setStatus("disabled");
        continue;
      }
      if (site.alerts_muted) {
        await setStatus("muted");
        continue;
      }
      const recipients = await recipientsFor(ex, a.org_id, site.alert_recipients ?? []);
      if (!recipients.length) {
        await setStatus("no_recipients");
        continue;
      }
      for (const r of recipients) {
        await d.mailer.send(
          siteAlertEmail(d.mailer.brand, {
            to: r.email,
            kind: a.kind,
            title: a.title,
            details,
            siteUrl: site.url,
            dashboardUrl: `${d.appUrl}/dashboard/sites/${a.site_id}`,
            workspace: site.org_name,
          }),
        );
        sent++;
      }
      await setStatus("sent", recipients.map((r) => r.userId));
    } catch (err) {
      await ex.query(`UPDATE alerts SET status = 'pending' WHERE id = $1`, [a.id]).catch(() => {});
      throw err;
    }
  }
  return sent;
}
