/**
 * Ticket storage. Every read path is scoped: by org (+ user unless owner/admin), by an access token for
 * anonymous submitters, or by the operator platform role. A ticket that is not visible is reported as
 * "not found" so ids cannot be probed.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Author, Category, Priority, SqlExecutor, TicketStatus } from "./types";
import { UUID_RE } from "./types";

export interface TicketRow {
  id: string;
  app: string;
  org_id: string | null;
  user_id: string | null;
  email: string;
  subject: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  escalated: boolean;
  escalation_reason: string | null;
  source: string;
  access_salt: string;
  access_token_hash: string;
  last_customer_at: Date | null;
  last_staff_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type PublicTicket = Omit<TicketRow, "access_salt" | "access_token_hash">;

export interface MessageRow {
  id: string;
  ticket_id: string;
  author: Author;
  body: string;
  automated: boolean;
  created_at: Date;
}

const PUBLIC_COLS = `id, app, org_id, user_id, email, subject, category, priority, status, escalated, escalation_reason, source,
  last_customer_at, last_staff_at, closed_at, created_at, updated_at`;

export function newSalt(): string {
  return randomBytes(16).toString("base64url");
}

/** Deterministic per-ticket token: HMAC(server secret, id + random salt). Regenerated for each email; only its hash is stored. */
export function accessToken(secret: string, ticketId: string, salt: string): string {
  return createHmac("sha256", secret).update(`support-ticket:${ticketId}:${salt}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(provided: string, storedHash: string): boolean {
  if (typeof provided !== "string" || provided.length < 20 || provided.length > 200) return false;
  const a = Buffer.from(hashToken(provided), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface InsertTicket {
  id: string;
  app: string;
  orgId: string | null;
  userId: string | null;
  email: string;
  subject: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  escalated: boolean;
  escalationReason: string | null;
  source: "form" | "chat";
  salt: string;
  tokenHash: string;
  body: string;
  now: Date;
}

export async function insertTicket(tx: SqlExecutor, t: InsertTicket): Promise<void> {
  const now = t.now.toISOString();
  await tx.query(
    `INSERT INTO support_tickets (id, app, org_id, user_id, email, subject, category, priority, status, escalated, escalation_reason,
       source, access_salt, access_token_hash, last_customer_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$15)`,
    [t.id, t.app, t.orgId, t.userId, t.email, t.subject, t.category, t.priority, t.status, t.escalated, t.escalationReason, t.source, t.salt, t.tokenHash, now],
  );
  await addMessage(tx, t.id, "customer", t.body, { now: t.now });
}

export async function addMessage(ex: SqlExecutor, ticketId: string, author: Author, body: string, o: { now: Date; automated?: boolean }): Promise<string> {
  const { rows } = await ex.query<{ id: string }>(
    `INSERT INTO support_messages (ticket_id, author, body, automated, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [ticketId, author, body, o.automated ?? false, o.now.toISOString()],
  );
  return rows[0]!.id;
}

export async function getTicketRaw(ex: SqlExecutor, id: string): Promise<TicketRow | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await ex.query<TicketRow>(`SELECT * FROM support_tickets WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export function toPublic(t: TicketRow): PublicTicket {
  const { access_salt: _s, access_token_hash: _h, ...rest } = t;
  return rest;
}

export async function listMessages(ex: SqlExecutor, ticketId: string): Promise<MessageRow[]> {
  const { rows } = await ex.query<MessageRow>(
    `SELECT id, ticket_id, author, body, automated, created_at FROM support_messages WHERE ticket_id = $1 ORDER BY created_at, seq`,
    [ticketId],
  );
  return rows;
}

/** Org-scoped list: owners/admins see the org's tickets, members only their own. */
export async function listTicketsForMember(ex: SqlExecutor, o: { orgId: string; userId: string; seeAll: boolean; limit?: number }): Promise<PublicTicket[]> {
  const { rows } = await ex.query<PublicTicket>(
    `SELECT ${PUBLIC_COLS} FROM support_tickets
     WHERE org_id = $1 AND ($3::boolean OR user_id = $2)
     ORDER BY updated_at DESC LIMIT $4`,
    [o.orgId, o.userId, o.seeAll, o.limit ?? 100],
  );
  return rows;
}

export async function getTicketForMember(ex: SqlExecutor, id: string, o: { orgId: string; userId: string; seeAll: boolean }): Promise<TicketRow | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await ex.query<TicketRow>(
    `SELECT * FROM support_tickets WHERE id = $1 AND org_id = $2 AND ($4::boolean OR user_id = $3)`,
    [id, o.orgId, o.userId, o.seeAll],
  );
  return rows[0] ?? null;
}

export async function updateTicket(
  ex: SqlExecutor,
  id: string,
  patch: { status?: TicketStatus; customerActivity?: boolean; staffActivity?: boolean },
  now: Date,
): Promise<void> {
  await ex.query(
    `UPDATE support_tickets SET
       status = COALESCE($2, status),
       last_customer_at = CASE WHEN $3::boolean THEN $5::timestamptz ELSE last_customer_at END,
       last_staff_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE last_staff_at END,
       closed_at = CASE WHEN $2 = 'closed' THEN $5::timestamptz WHEN $2 IS NOT NULL THEN NULL ELSE closed_at END,
       updated_at = $5
     WHERE id = $1`,
    [id, patch.status ?? null, patch.customerActivity ?? false, patch.staffActivity ?? false, now.toISOString()],
  );
}

export interface QueueFilter {
  status?: TicketStatus | "active";
  priority?: Priority;
  category?: Category;
  limit?: number;
}

/** Operator queue: escalated first, then priority, then oldest-waiting first. */
export async function listQueue(ex: SqlExecutor, f: QueueFilter = {}): Promise<PublicTicket[]> {
  const status = f.status ?? "active";
  const { rows } = await ex.query<PublicTicket>(
    `SELECT ${PUBLIC_COLS} FROM support_tickets
     WHERE (CASE WHEN $1 = 'active' THEN status IN ('open', 'waiting_on_operator', 'waiting_on_customer') ELSE status = $1 END)
       AND ($2::text IS NULL OR priority = $2) AND ($3::text IS NULL OR category = $3)
     ORDER BY escalated DESC, (CASE priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END) DESC,
       (status = 'waiting_on_operator' OR status = 'open') DESC, updated_at ASC
     LIMIT $4`,
    [status, f.priority ?? null, f.category ?? null, Math.min(f.limit ?? 200, 500)],
  );
  return rows;
}

export async function queueCounts(ex: SqlExecutor): Promise<{ open: number; escalated: number; waitingOnOperator: number }> {
  const { rows } = await ex.query<{ open: number; escalated: number; waiting: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('open', 'waiting_on_operator', 'waiting_on_customer'))::int AS open,
            count(*) FILTER (WHERE escalated AND status IN ('open', 'waiting_on_operator'))::int AS escalated,
            count(*) FILTER (WHERE status IN ('open', 'waiting_on_operator'))::int AS waiting
     FROM support_tickets`,
  );
  const r = rows[0];
  return { open: Number(r?.open ?? 0), escalated: Number(r?.escalated ?? 0), waitingOnOperator: Number(r?.waiting ?? 0) };
}

/** Tickets waiting on the customer with no customer reply for `days` days. */
export async function dueForAutoClose(ex: SqlExecutor, now: Date, days = 7): Promise<TicketRow[]> {
  const before = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { rows } = await ex.query<TicketRow>(
    `SELECT * FROM support_tickets
     WHERE status = 'waiting_on_customer' AND last_staff_at IS NOT NULL AND last_staff_at < $1
       AND (last_customer_at IS NULL OR last_customer_at <= last_staff_at)
     ORDER BY last_staff_at LIMIT 500`,
    [before],
  );
  return rows;
}

/** Account deletion: tickets of orgs being deleted and tickets the user opened. */
export async function purgeSupportData(ex: SqlExecutor, o: { orgIds: string[]; userId?: string }): Promise<number> {
  const { rows } = await ex.query<{ id: string }>(
    `DELETE FROM support_tickets WHERE org_id = ANY($1::text[]) OR ($2::text IS NOT NULL AND user_id = $2) RETURNING id`,
    [o.orgIds, o.userId ?? null],
  );
  return rows.length;
}
