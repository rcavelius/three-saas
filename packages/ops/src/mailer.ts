/**
 * Transactional email through a Postgres outbox.
 *
 * send() inserts into ops_email_outbox and enqueues an `email.send` job in the same transaction, so a
 * message is never lost if the provider is down and never sent twice: the Resend Idempotency-Key is
 * the outbox id. Without RESEND_API_KEY (dev) messages are marked `logged` and never leave the box.
 * Retries use the job queue's exponential backoff; the final failure dead-letters the job (the
 * scheduler then raises incident `job:email.send`).
 */
import { enqueueJob, type DbHandle } from "@repo/database";
import type { Logger } from "@repo/monitoring";
import {
  PermanentJobError,
  isPermanentJobError,
  silentLogger,
  systemClock,
  type Brand,
  type Clock,
  type EmailMessage,
  type FetchLike,
  type JobHandler,
} from "./types";

export const EMAIL_QUEUE = "email.send";
const RESEND_URL = "https://api.resend.com/emails";
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/** "jane.doe@example.com" -> "j***@example.com". Use whenever an address would be logged. */
export function maskEmail(addr: string): string {
  const at = addr.lastIndexOf("@");
  if (at < 1) return "***";
  return `${addr[0]}***@${addr.slice(at + 1)}`;
}

export interface Mailer {
  readonly brand: Brand;
  readonly queue: typeof EMAIL_QUEUE;
  /** Queues a message; returns the outbox id. */
  send(msg: EmailMessage): Promise<{ id: string }>;
  /** Job handler for the `email.send` queue; register it with the scheduler. */
  jobHandler: JobHandler;
}

export interface MailerOptions {
  handle: DbHandle<any>;
  /** e.g. "ChangeKite <hello@mail.changekite.com>" */
  from: string;
  resendApiKey?: string;
  /**
   * Cloudflare deployment: POST each message to the app's own Worker (`/__edge/email`), which sends it
   * through Cloudflare Email Sending. Takes precedence over Resend. Defaults to EMAIL_RELAY_URL /
   * EMAIL_RELAY_SECRET from the environment so every app gets it without extra wiring.
   */
  relayUrl?: string;
  relaySecret?: string;
  brand: Brand;
  fetch?: FetchLike;
  now?: Clock;
  logger?: Logger;
  maxAttempts?: number;
  timeoutMs?: number;
}

interface OutboxRow {
  id: string;
  to_address: string;
  subject: string;
  text_body: string;
  html_body: string;
  tag: string;
  status: string;
}

class RetryableEmailError extends Error {}

export function createMailer(opts: MailerOptions): Mailer {
  const ex = opts.handle.executor;
  const clock = opts.now ?? systemClock;
  const logger = opts.logger ?? silentLogger;
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const maxAttempts = opts.maxAttempts ?? 6;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const apiKey = opts.resendApiKey?.trim() || undefined;
  const relayUrl = (opts.relayUrl ?? process.env.EMAIL_RELAY_URL)?.trim() || undefined;
  const relaySecret = (opts.relaySecret ?? process.env.EMAIL_RELAY_SECRET)?.trim() || undefined;
  const relay = relayUrl && relaySecret ? { url: relayUrl, secret: relaySecret } : undefined;

  async function setStatus(id: string, status: string, fields: { error?: string | null; providerId?: string } = {}) {
    await ex.query(
      `UPDATE ops_email_outbox SET status = $2, attempts = attempts + 1, error = $3,
         provider_id = COALESCE($4, provider_id),
         sent_at = CASE WHEN $2 IN ('sent', 'logged') THEN $5::timestamptz ELSE sent_at END
       WHERE id = $1`,
      [id, status, fields.error ?? null, fields.providerId ?? null, clock().toISOString()],
    );
  }

  const jobHandler: JobHandler = async (payload, ctx) => {
    const id = typeof payload.outboxId === "string" ? payload.outboxId : null;
    if (!id) throw new PermanentJobError("email.send job without outboxId");
    const { rows } = await ex.query<OutboxRow>(
      `SELECT id, to_address, subject, text_body, html_body, tag, status FROM ops_email_outbox WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new PermanentJobError(`outbox row ${id} not found`);
    if (row.status === "sent" || row.status === "logged") return; // already delivered (idempotent)
    const logFields = { outboxId: id, to: maskEmail(row.to_address), tag: row.tag };

    if (!apiKey && !relay) {
      await setStatus(id, "logged");
      logger.info("email logged (no RESEND_API_KEY configured)", logFields);
      return;
    }

    try {
      let res: Response;
      if (relay) {
        try {
          res = await doFetch(relay.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${relay.secret}`, "Content-Type": "application/json", "Idempotency-Key": id },
            body: JSON.stringify({ from: opts.from, to: row.to_address, subject: row.subject, html: row.html_body, text: row.text_body }),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          throw new RetryableEmailError(`network error: ${(err as Error).name}`);
        }
        const body = (await res.json().catch(() => ({}))) as { id?: unknown; code?: unknown };
        if (res.ok) {
          await setStatus(id, "sent", { providerId: typeof body.id === "string" ? body.id : undefined });
          logger.info("email sent", logFields);
          return;
        }
        const reason = `edge ${res.status}${typeof body.code === "string" ? ` ${body.code.slice(0, 60)}` : ""}`;
        if (res.status === 429 || res.status >= 500) throw new RetryableEmailError(reason);
        throw new PermanentJobError(reason);
      }
      try {
        res = await doFetch(RESEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": id,
          },
          body: JSON.stringify({
            from: opts.from,
            to: [row.to_address],
            subject: row.subject,
            html: row.html_body,
            text: row.text_body,
            tags: [{ name: "category", value: row.tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) || "none" }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        throw new RetryableEmailError(`network error: ${(err as Error).name}`);
      }
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { id?: unknown };
        await setStatus(id, "sent", { providerId: typeof body.id === "string" ? body.id : undefined });
        logger.info("email sent", logFields);
        return;
      }
      // Provider error bodies can echo the address; keep only the status and error name.
      const errBody = (await res.json().catch(() => ({}))) as { name?: unknown };
      const reason = `resend ${res.status}${typeof errBody.name === "string" ? ` ${errBody.name.slice(0, 60)}` : ""}`;
      if (res.status === 429 || res.status === 409 || res.status >= 500) throw new RetryableEmailError(reason);
      throw new PermanentJobError(reason);
    } catch (err) {
      const permanent = isPermanentJobError(err);
      const message = (err as Error).message;
      const final = permanent || ctx.isFinalAttempt;
      await setStatus(id, final ? "failed" : "retrying", { error: message });
      logger.warn(final ? "email failed permanently" : "email send failed, will retry", { ...logFields, reason: message });
      throw err;
    }
  };

  return {
    brand: opts.brand,
    queue: EMAIL_QUEUE,
    jobHandler,
    async send(msg) {
      const to = msg.to.trim();
      if (!EMAIL_RE.test(to) || to.length > 320) throw new Error("Invalid recipient address");
      const subject = msg.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 300);
      return opts.handle.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO ops_email_outbox (to_address, subject, text_body, html_body, tag, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'queued', $6) RETURNING id`,
          [to, subject, msg.text, msg.html, msg.tag.slice(0, 100), clock().toISOString()],
        );
        const id = rows[0]!.id;
        await enqueueJob(tx, EMAIL_QUEUE, { outboxId: id }, { runAt: clock(), maxAttempts });
        logger.debug("email queued", { outboxId: id, to: maskEmail(to), tag: msg.tag });
        return { id };
      });
    },
  };
}
