/**
 * createSupport(): one object per app wiring the help center, the chat assistant, tickets, operator tools,
 * scheduled jobs and the HTTP handler mounted at /api/support/[...path].
 */
import { randomUUID } from "node:crypto";
import { enqueueJob, rateLimit, type DbHandle } from "@repo/database";
import type { Logger } from "@repo/monitoring";
import {
  getClientIp,
  maskEmail,
  raiseIncident,
  rateLimitKeyForIp,
  silentLogger,
  type Brand,
  type ClientIpConfig,
  type JobHandler,
  type Mailer,
  type ScheduleDef,
} from "@repo/ops";
import {
  askModel,
  buildRequest,
  buildUserContent,
  capHistory,
  createAnthropicClient,
  DEFAULT_MODEL,
  estimateCostMicros,
  MAX_MESSAGE_CHARS,
  type AccountContext,
  type AnthropicLike,
  type HistoryMessage,
} from "./ai";
import { loadArticlesFromDir, syncArticles, type SyncReport } from "./articles";
import { checkBudgetIncidents, reserveBudget, settleBudget, budgetStatus, type BudgetConfig } from "./budget";
import { categorize, categorizeByRules, ESCALATION_REASONS, isEscalated, priorityFor } from "./categorize";
import { isSalesPitch } from "./spam";
import {
  operatorAlertEmail,
  ticketAutoClosedEmail,
  ticketEscalatedEmail,
  ticketReceivedEmail,
  ticketReplyEmail,
  ticketStatusEmail,
} from "./emails";
import { articleSlugs, getArticle, listArticles, searchArticles, searchChunks, type ChunkHit } from "./search";
import {
  accessToken,
  addMessage,
  dueForAutoClose,
  getTicketForMember,
  getTicketRaw,
  hashToken,
  insertTicket,
  listMessages,
  listQueue,
  listTicketsForMember,
  newSalt,
  purgeSupportData,
  queueCounts,
  toPublic,
  tokenMatches,
  updateTicket,
  type MessageRow,
  type PublicTicket,
  type QueueFilter,
  type TicketRow,
} from "./tickets";
import { isCategory, isStatus, type Category, type TicketStatus } from "./types";

export interface SupportUser {
  id: string;
  email: string;
  emailVerified?: boolean | null;
}

/** Structural subset of @repo/auth's AppAuth (tests may pass a fake). */
export interface SupportAuth {
  getSession(headers: Headers): Promise<{ user: SupportUser } | null>;
  requireOrg(headers: Headers): Promise<{ user: SupportUser; org: { id: string }; role: string }>;
}

export interface SupportOptions {
  /** App id stored on tickets, e.g. "changekite". */
  app: string;
  handle: DbHandle<any>;
  auth: SupportAuth;
  mailer: Mailer;
  brand: Brand;
  appUrl: string;
  clientIp: ClientIpConfig;
  /** Server secret for ticket access tokens (SESSION_SECRET). */
  tokenSecret: string;
  /** SUPPORT_OPERATOR_EMAIL (falls back to OWNER_ALERT_EMAIL in the app). */
  operatorEmail?: string;
  /** Directory with the app's help articles (*.md). */
  contentDir?: string;
  /** Plan display name for the signed-in user's org (the only account fact the model may see). */
  getPlanName?: (orgId: string) => Promise<string | null>;
  ai?: {
    apiKey?: string;
    model?: string;
    monthlyBudgetCents?: number;
    dailyBudgetCents?: number;
    timeoutMs?: number;
    /** Tests: a spy with the SDK's messages.create shape. Overrides apiKey. */
    client?: AnthropicLike;
  };
  limits?: Partial<SupportLimits>;
  logger?: Logger;
  now?: () => Date;
  /** Admin pages base path (default /admin/support). */
  adminPath?: string;
}

export interface SupportLimits {
  chatPerIp: { limit: number; windowMs: number };
  chatPerUser: { limit: number; windowMs: number };
  aiGlobal: { limit: number; windowMs: number };
  ticketsPerIp: { limit: number; windowMs: number };
  ticketsPerUser: { limit: number; windowMs: number };
  repliesPerIp: { limit: number; windowMs: number };
}

export const DEFAULT_LIMITS: SupportLimits = {
  chatPerIp: { limit: 10, windowMs: 10 * 60_000 },
  chatPerUser: { limit: 30, windowMs: 60 * 60_000 },
  aiGlobal: { limit: 200, windowMs: 60 * 60_000 },
  ticketsPerIp: { limit: 5, windowMs: 60 * 60_000 },
  ticketsPerUser: { limit: 10, windowMs: 60 * 60_000 },
  repliesPerIp: { limit: 30, windowMs: 60 * 60_000 },
};

export const SUPPORT_QUEUES = {
  syncArticles: "support.sync_articles",
  autoClose: "support.auto_close",
  firstAnswer: "support.first_answer",
} as const;

export interface ArticleLink {
  slug: string;
  title: string;
  summary?: string;
  url: string;
}

export interface ChatResult {
  mode: "ai" | "fallback";
  answer: string | null;
  citations: ArticleLink[];
  confidence: "high" | "low";
  suggestTicket: boolean;
  category: Category | null;
  articles: ArticleLink[];
  /** Why the fallback was used (not shown verbatim to customers). */
  reason?: string;
}

export type Viewer =
  | { kind: "member"; user: SupportUser; orgId: string; role: string; seeAll: boolean }
  | { kind: "user"; user: SupportUser }
  | { kind: "anonymous" };

export type TicketAccess = { ticket: TicketRow; via: "member" | "token"; token?: string };

export class SupportError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SupportError";
  }
}

/** Routine questions the help articles usually answer: they get an automated first answer. */
const ROUTINE = new Set<Category>(["how-to", "account", "billing"]);
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TICKET_CHARS = 5000;

export function createSupport(o: SupportOptions) {
  const ex = o.handle.executor;
  const now = o.now ?? (() => new Date());
  const logger = o.logger ?? silentLogger;
  const limits: SupportLimits = { ...DEFAULT_LIMITS, ...o.limits };
  const appOrigin = new URL(o.appUrl).origin;
  const adminPath = o.adminPath ?? "/admin/support";
  const model = o.ai?.model?.trim() || DEFAULT_MODEL;
  const monthlyCapCents = o.ai?.monthlyBudgetCents ?? 500;
  const budget: BudgetConfig = {
    monthlyCapCents,
    dailyCapCents: o.ai?.dailyBudgetCents ?? Math.max(1, Math.floor(monthlyCapCents / 20)),
  };
  const timeoutMs = o.ai?.timeoutMs ?? 20_000;
  const aiClient: AnthropicLike | null = o.ai?.client ?? (o.ai?.apiKey?.trim() ? createAnthropicClient(o.ai.apiKey.trim(), timeoutMs) : null);

  const articleUrl = (slug: string) => `/help/${slug}`;
  const link = (a: { slug: string; title: string; summary?: string }): ArticleLink => ({ slug: a.slug, title: a.title, summary: a.summary, url: articleUrl(a.slug) });

  // ----------------------------------------------------------------------------------------------
  // Articles
  // ----------------------------------------------------------------------------------------------
  let syncOnce: Promise<SyncReport | null> | null = null;
  async function syncFromDisk(): Promise<SyncReport | null> {
    if (!o.contentDir) return null;
    const articles = await loadArticlesFromDir(o.contentDir);
    const r = await syncArticles(o.handle, articles, now());
    logger.info("help articles synced", { ...r });
    return r;
  }
  /** Runs one sync per process before the first help/chat request (the scheduled job keeps it fresh). */
  function ensureArticles(): Promise<SyncReport | null> {
    syncOnce ??= syncFromDisk().catch((err) => {
      syncOnce = null;
      logger.error("help article sync failed", { err: err instanceof Error ? err.message : String(err) });
      return null;
    });
    return syncOnce;
  }

  // ----------------------------------------------------------------------------------------------
  // Viewer / access
  // ----------------------------------------------------------------------------------------------
  async function getViewer(headers: Headers): Promise<Viewer> {
    const s = await o.auth.getSession(headers).catch(() => null);
    if (!s) return { kind: "anonymous" };
    try {
      const r = await o.auth.requireOrg(headers);
      return { kind: "member", user: r.user, orgId: r.org.id, role: r.role, seeAll: r.role === "owner" || r.role === "admin" };
    } catch {
      return { kind: "user", user: s.user };
    }
  }

  async function isOperator(headers: Headers): Promise<SupportUser | null> {
    const s = await o.auth.getSession(headers).catch(() => null);
    if (!s) return null;
    const { rows } = await ex.query<{ role: string | null }>(`SELECT role FROM auth_user WHERE id = $1`, [s.user.id]);
    const role = rows[0]?.role;
    return role === "operator" || role === "owner" ? s.user : null;
  }

  /** Member path first (org + own-or-admin), then the anonymous access token. Anything else: null (404). */
  async function resolveAccess(headers: Headers, id: string, token?: string | null): Promise<TicketAccess | null> {
    const v = await getViewer(headers);
    if (v.kind === "member") {
      const t = await getTicketForMember(ex, id, { orgId: v.orgId, userId: v.user.id, seeAll: v.seeAll });
      if (t) return { ticket: t, via: "member" };
    }
    if (token) {
      const t = await getTicketRaw(ex, id);
      if (t && tokenMatches(token, t.access_token_hash)) return { ticket: t, via: "token", token };
    }
    return null;
  }

  function customerUrl(t: Pick<TicketRow, "id" | "user_id" | "access_salt">): string {
    const base = `${appOrigin}/support/tickets/${t.id}`;
    return t.user_id ? base : `${base}?t=${encodeURIComponent(accessToken(o.tokenSecret, t.id, t.access_salt))}`;
  }

  async function sendSafe(m: Parameters<Mailer["send"]>[0]): Promise<void> {
    try {
      await o.mailer.send(m);
    } catch (err) {
      logger.warn("support email not queued", { to: maskEmail(m.to), tag: m.tag, err: err instanceof Error ? err.message : String(err) });
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Assistant
  // ----------------------------------------------------------------------------------------------
  async function fallback(question: string, reason: string, category: Category | null = null): Promise<ChatResult> {
    const hits = await searchArticles(ex, question, 5);
    return {
      mode: "fallback",
      answer: null,
      citations: [],
      confidence: "low",
      suggestTicket: true,
      category,
      articles: hits.map(link),
      reason,
    };
  }

  /**
   * The full answer pipeline (no HTTP concerns): retrieval -> global limit -> budget reserve -> model ->
   * validate -> settle. Any failure returns the search fallback.
   */
  async function answer(question: string, history: HistoryMessage[], account: AccountContext | null): Promise<ChatResult> {
    await ensureArticles();
    const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
    const excerpts: ChunkHit[] = await searchChunks(ex, `${question} ${lastUser}`.slice(0, 2000), 5);
    if (!aiClient) return fallback(question, "ai_not_configured");
    if (excerpts.length === 0) return fallback(question, "no_matching_articles");

    const t = now();
    const g = await rateLimit(ex, "support_ai:global", limits.aiGlobal.limit, limits.aiGlobal.windowMs, t);
    if (!g.allowed) return fallback(question, "ai_busy");

    const request = buildRequest(model, o.brand.name, buildUserContent({ question, excerpts, history, account }));
    const reserved = await reserveBudget(o.handle, budget, estimateCostMicros(model, request), t);
    if (!reserved.ok) {
      await checkBudgetIncidents(ex, budget, t, { app: o.brand.name, refused: reserved.reason }).catch(() => {});
      return fallback(question, "budget_exhausted");
    }
    const slugs = new Set(excerpts.map((e) => e.slug));
    const out = await askModel(aiClient, request, slugs, timeoutMs);
    const charged = out.ok ? out.costMicros : out.reason === "timeout" ? reserved.reservation.micros : out.costMicros;
    await settleBudget(o.handle, reserved.reservation, charged, out.usage ?? { inputTokens: 0, outputTokens: 0 }, now());
    await checkBudgetIncidents(ex, budget, now(), { app: o.brand.name }).catch(() => {});
    if (!out.ok) {
      logger.warn("support assistant fell back", { reason: out.reason });
      return fallback(question, `ai_${out.reason}`);
    }
    const titles = new Map(excerpts.map((e) => [e.slug, e.title]));
    const citations = out.answer.citations.map((slug) => link({ slug, title: titles.get(slug) ?? slug }));
    const related = (await searchArticles(ex, question, 5)).filter((a) => !out.answer.citations.includes(a.slug)).slice(0, 3);
    return {
      mode: "ai",
      answer: out.answer.answer,
      citations,
      confidence: out.answer.confidence,
      suggestTicket: out.answer.suggestTicket,
      category: out.answer.category,
      articles: related.map(link),
    };
  }

  async function accountContext(v: Viewer): Promise<AccountContext | null> {
    if (v.kind === "anonymous") return null;
    const planName = v.kind === "member" && o.getPlanName ? await o.getPlanName(v.orgId).catch(() => null) : null;
    return { planName, emailVerified: Boolean(v.user.emailVerified) };
  }

  // ----------------------------------------------------------------------------------------------
  // Tickets
  // ----------------------------------------------------------------------------------------------
  interface CreateInput {
    subject: string;
    message: string;
    email?: string;
    category?: string;
    source?: "form" | "chat";
  }

  async function createTicket(viewer: Viewer, input: CreateInput): Promise<{ ticket: PublicTicket; url: string; token: string }> {
    const subject = input.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    const message = input.message.trim();
    if (subject.length < 3) throw new SupportError(400, "subject_required", "Please add a short subject.");
    if (message.length < 10) throw new SupportError(400, "message_required", "Please describe the problem (at least 10 characters).");
    if (message.length > MAX_TICKET_CHARS) throw new SupportError(413, "message_too_long", `Please keep the message under ${MAX_TICKET_CHARS} characters.`);
    const email = viewer.kind === "anonymous" ? (input.email ?? "").trim() : viewer.user.email;
    if (!EMAIL_RE.test(email) || email.length > 254) throw new SupportError(400, "email_required", "Please enter a valid email address so we can reply.");

    const text = `${subject}\n${message}`;
    const category = categorize(text, isCategory(input.category) ? input.category : undefined);
    const ruleCategory = categorizeByRules(text);
    // Anonymous sales pitches: stored closed, no escalation, no emails (see spam.ts).
    const pitch = viewer.kind === "anonymous" && !(ruleCategory && isEscalated(ruleCategory)) && isSalesPitch(text);
    const escalated = !pitch && isEscalated(category);
    const reason = escalated ? (ESCALATION_REASONS[category] ?? "Needs a person") : null;
    const id = randomUUID();
    const salt = newSalt();
    const token = accessToken(o.tokenSecret, id, salt);
    const t = now();
    const status: TicketStatus = pitch ? "closed" : escalated ? "waiting_on_operator" : "open";
    await o.handle.transaction(async (tx) => {
      await insertTicket(tx, {
        id,
        app: o.app,
        orgId: viewer.kind === "member" ? viewer.orgId : null,
        userId: viewer.kind === "anonymous" ? null : viewer.user.id,
        email,
        subject,
        category,
        priority: pitch ? "low" : priorityFor(category),
        status,
        escalated,
        escalationReason: reason,
        source: input.source === "chat" ? "chat" : "form",
        salt,
        tokenHash: hashToken(token),
        body: message,
        now: t,
      });
      if (pitch) {
        await addMessage(tx, id, "system", "Closed automatically: looks like an unsolicited sales pitch. No email was sent.", { now: t, automated: true });
      } else if (escalated) {
        await addMessage(tx, id, "system", `Escalated to a person: ${reason}.`, { now: t, automated: true });
      } else if (ROUTINE.has(category)) {
        await enqueueJob(tx, SUPPORT_QUEUES.firstAnswer, { ticketId: id }, { runAt: t, maxAttempts: 3 });
      }
    });
    const row = (await getTicketRaw(ex, id))!;
    const url = customerUrl(row);
    logger.info("support ticket created", { ticketId: id, category, escalated, pitch, to: maskEmail(email) });

    if (pitch) {
      // Nothing to send: no operator alert, and no reply to the pitch address.
    } else if (escalated) {
      await raiseIncident(
        ex,
        {
          fingerprint: `support:escalation:${id}`,
          severity: category === "security" ? "critical" : "warning",
          source: "support",
          title: `${o.brand.name}: escalated support ticket (${reason})`,
          details: { ticketId: id, category, adminUrl: `${appOrigin}${adminPath}/${id}` },
        },
        { now: t },
      );
      await sendSafe(ticketEscalatedEmail(o.brand, { to: email, ticketId: id, subject, reason: reason!, url }));
      if (o.operatorEmail) {
        await sendSafe(operatorAlertEmail(o.brand, { to: o.operatorEmail, ticketId: id, category, reason: reason!, adminUrl: `${appOrigin}${adminPath}/${id}` }));
      }
    } else {
      await sendSafe(ticketReceivedEmail(o.brand, { to: email, ticketId: id, subject, url }));
    }
    return { ticket: toPublic(row), url, token };
  }

  async function customerReply(access: TicketAccess, body: string): Promise<void> {
    const text = body.trim();
    if (text.length < 1) throw new SupportError(400, "message_required", "Please write a reply.");
    if (text.length > MAX_TICKET_CHARS) throw new SupportError(413, "message_too_long", `Please keep the reply under ${MAX_TICKET_CHARS} characters.`);
    if (access.ticket.status === "closed") throw new SupportError(409, "ticket_closed", "This request is closed. Please open a new one.");
    const t = now();
    await o.handle.transaction(async (tx) => {
      await addMessage(tx, access.ticket.id, "customer", text, { now: t });
      await updateTicket(tx, access.ticket.id, { status: "waiting_on_operator", customerActivity: true }, t);
    });
    if (o.operatorEmail) {
      await sendSafe(
        operatorAlertEmail(o.brand, {
          to: o.operatorEmail,
          ticketId: access.ticket.id,
          category: access.ticket.category,
          reason: "the customer replied",
          adminUrl: `${appOrigin}${adminPath}/${access.ticket.id}`,
        }),
      );
    }
  }

  async function customerResolve(access: TicketAccess): Promise<void> {
    if (access.ticket.status === "closed") throw new SupportError(409, "ticket_closed", "This request is already closed.");
    const t = now();
    await o.handle.transaction(async (tx) => {
      await addMessage(tx, access.ticket.id, "system", "The customer marked this request as resolved.", { now: t, automated: true });
      await updateTicket(tx, access.ticket.id, { status: "resolved", customerActivity: true }, t);
    });
  }

  async function operatorReply(operator: SupportUser, id: string, body: string, nextStatus: TicketStatus = "waiting_on_customer"): Promise<void> {
    const ticket = await getTicketRaw(ex, id);
    if (!ticket) throw new SupportError(404, "not_found", "Not found");
    const text = body.trim();
    if (!text) throw new SupportError(400, "message_required", "Write a reply first.");
    if (text.length > 10_000) throw new SupportError(413, "message_too_long", "Reply too long.");
    const t = now();
    await o.handle.transaction(async (tx) => {
      await addMessage(tx, id, "operator", text, { now: t });
      await updateTicket(tx, id, { status: nextStatus, staffActivity: true }, t);
    });
    logger.info("support operator replied", { ticketId: id, operator: maskEmail(operator.email) });
    await sendSafe(ticketReplyEmail(o.brand, { to: ticket.email, ticketId: id, subject: ticket.subject, body: text, automated: false, url: customerUrl(ticket) }));
  }

  async function operatorSetStatus(id: string, status: TicketStatus): Promise<void> {
    const ticket = await getTicketRaw(ex, id);
    if (!ticket) throw new SupportError(404, "not_found", "Not found");
    if (ticket.status === status) return;
    const t = now();
    await o.handle.transaction(async (tx) => {
      await addMessage(tx, id, "system", `Status changed to ${status.replace(/_/g, " ")}.`, { now: t, automated: true });
      await updateTicket(tx, id, { status, staffActivity: status === "waiting_on_customer" }, t);
    });
    await sendSafe(ticketStatusEmail(o.brand, { to: ticket.email, ticketId: id, status, url: customerUrl(ticket) }));
  }

  /** Job: draft an automated first answer for a routine how-to ticket from the docs. */
  async function firstAnswer(ticketId: string): Promise<"answered" | "skipped"> {
    const ticket = await getTicketRaw(ex, ticketId);
    if (!ticket || ticket.status !== "open" || ticket.escalated || ticket.last_staff_at) return "skipped";
    const first = (await listMessages(ex, ticketId)).find((m) => m.author === "customer");
    const question = `${ticket.subject}\n${first?.body ?? ""}`.slice(0, MAX_MESSAGE_CHARS);
    const r = await answer(question, [], null);
    let body: string;
    if (r.mode === "ai" && r.confidence === "high" && r.answer) {
      body = `${r.answer}\n\nSources:\n${r.citations.map((c) => `- ${c.title}: ${appOrigin}${c.url}`).join("\n")}`;
    } else if (r.articles.length > 0) {
      body = `These help articles may answer your question:\n${r.articles.slice(0, 3).map((a) => `- ${a.title}: ${appOrigin}${a.url}`).join("\n")}`;
    } else {
      return "skipped"; // nothing useful to say; a person will answer
    }
    body = `Automated answer (drafted from our help articles, not reviewed by a person):\n\n${body}\n\nIf this solves it, please mark the request resolved. If not, reply and a person will follow up.`;
    const t = now();
    const fresh = await o.handle.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM support_tickets WHERE id = $1 AND status = 'open' AND last_staff_at IS NULL FOR UPDATE`,
        [ticketId],
      );
      if (!rows[0]) return false;
      await addMessage(tx, ticketId, "assistant", body, { now: t, automated: true });
      await updateTicket(tx, ticketId, { status: "waiting_on_customer", staffActivity: true }, t);
      return true;
    });
    if (!fresh) return "skipped";
    await sendSafe(ticketReplyEmail(o.brand, { to: ticket.email, ticketId, subject: ticket.subject, body, automated: true, url: customerUrl(ticket) }));
    return "answered";
  }

  async function autoClose(): Promise<number> {
    const t = now();
    const due = await dueForAutoClose(ex, t);
    let n = 0;
    for (const ticket of due) {
      const closed = await o.handle.transaction(async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `SELECT id FROM support_tickets WHERE id = $1 AND status = 'waiting_on_customer' FOR UPDATE`,
          [ticket.id],
        );
        if (!rows[0]) return false;
        await addMessage(tx, ticket.id, "system", "Closed automatically after 7 days without a reply from the customer.", { now: t, automated: true });
        await updateTicket(tx, ticket.id, { status: "closed" }, t);
        return true;
      });
      if (!closed) continue;
      n++;
      await sendSafe(ticketAutoClosedEmail(o.brand, { to: ticket.email, ticketId: ticket.id, url: customerUrl(ticket) }));
    }
    // Resolved requests quietly become closed after the same quiet period.
    await ex.query(
      `UPDATE support_tickets SET status = 'closed', closed_at = $1, updated_at = $1 WHERE status = 'resolved' AND updated_at < $2`,
      [t.toISOString(), new Date(t.getTime() - 7 * 86_400_000).toISOString()],
    );
    return n;
  }

  // ----------------------------------------------------------------------------------------------
  // Jobs
  // ----------------------------------------------------------------------------------------------
  const jobs: Record<string, JobHandler> = {
    [SUPPORT_QUEUES.syncArticles]: async () => {
      await syncFromDisk();
    },
    [SUPPORT_QUEUES.autoClose]: async (_p, ctx) => {
      const n = await autoClose();
      ctx.logger.info("support auto-close", { closed: n });
    },
    [SUPPORT_QUEUES.firstAnswer]: async (p) => {
      if (typeof p.ticketId === "string") await firstAnswer(p.ticketId);
    },
  };
  const schedules: ScheduleDef[] = [
    { name: SUPPORT_QUEUES.syncArticles, intervalSeconds: 3600, maxAttempts: 2 },
    { name: SUPPORT_QUEUES.autoClose, intervalSeconds: 86_400, maxAttempts: 3 },
  ];

  // ----------------------------------------------------------------------------------------------
  // HTTP
  // ----------------------------------------------------------------------------------------------
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
  const redirect = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });

  /**
   * CSRF check. A real Origin must equal APP_URL. Pages served with `Referrer-Policy: no-referrer` make
   * browsers send `Origin: null` on form posts, so for "null" we rely on the browser-controlled
   * Sec-Fetch-Site header, which must then be present and "same-origin".
   */
  function isSameOrigin(req: Request): boolean {
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    if (origin === "null") return site === "same-origin";
    if (origin) return origin === appOrigin;
    return site === null || site === "same-origin" || site === "none";
  }

  const isForm = (req: Request) => /^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(req.headers.get("content-type") ?? "");

  async function readBody(req: Request): Promise<Record<string, unknown> | null> {
    if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return null;
    if (isForm(req)) {
      try {
        const f = await req.formData();
        const out: Record<string, unknown> = {};
        for (const [k, v] of f.entries()) if (typeof v === "string") out[k] = v;
        return out;
      } catch {
        return null;
      }
    }
    if (!/^application\/json/i.test(req.headers.get("content-type") ?? "")) return null;
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return null;
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  async function limited(key: string, l: { limit: number; windowMs: number }): Promise<Response | null> {
    const t = now();
    const r = await rateLimit(ex, key, l.limit, l.windowMs, t);
    if (r.allowed) return null;
    const retry = Math.max(1, Math.ceil((r.resetAt.getTime() - t.getTime()) / 1000));
    return json(429, { error: "rate_limited", message: "Too many requests. Please wait a little and try again." }, { "retry-after": String(retry) });
  }

  function errorResponse(req: Request, err: unknown, formBack: string): Response {
    const e = err as { name?: string; status?: number; code?: string; message?: string };
    if (e && e.name === "SupportError" && typeof e.status === "number") {
      if (isForm(req)) return redirect(`${formBack}${formBack.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.code ?? "error")}`);
      return json(e.status, { error: e.code, message: e.message });
    }
    logger.error("support route failed", { path: new URL(req.url).pathname, err: err instanceof Error ? err.message : String(err) });
    return json(500, { error: "internal_error", message: "Something went wrong. Please try again." });
  }

  async function handleChat(req: Request): Promise<Response> {
    const ip = getClientIp(req.headers, o.clientIp);
    const ipLimited = await limited(`support_chat:${rateLimitKeyForIp(ip)}`, limits.chatPerIp);
    if (ipLimited) return ipLimited;
    const body = await readBody(req);
    if (!body || isForm(req)) return json(400, { error: "invalid_body", message: "Send JSON: { message, history }." });
    const message = str(body.message).trim();
    if (!message) return json(400, { error: "message_required", message: "Type a question first." });
    if (message.length > MAX_MESSAGE_CHARS) return json(413, { error: "message_too_long", message: `Please keep questions under ${MAX_MESSAGE_CHARS} characters.` });
    const viewer = await getViewer(req.headers);
    if (viewer.kind !== "anonymous") {
      const userLimited = await limited(`support_chat:user:${viewer.user.id}`, limits.chatPerUser);
      if (userLimited) return userLimited;
    }
    const result = await answer(message, capHistory(body.history), await accountContext(viewer));
    logger.info("support chat", { mode: result.mode, reason: result.reason, chars: message.length });
    const { reason: _r, ...publicResult } = result;
    return json(200, { ...publicResult, fallbackReason: result.mode === "fallback" ? publicReason(result.reason) : undefined });
  }

  async function handleCreate(req: Request): Promise<Response> {
    const ip = getClientIp(req.headers, o.clientIp);
    const body = await readBody(req);
    if (!body) return json(400, { error: "invalid_body", message: "Invalid request." });
    if (str(body.website).trim()) {
      // Honeypot filled in: answer like a success, create nothing.
      logger.info("support honeypot triggered", {});
      return isForm(req) ? redirect("/support?sent=1") : json(200, { ok: true });
    }
    const ipLimited = await limited(`support_ticket:${rateLimitKeyForIp(ip)}`, limits.ticketsPerIp);
    if (ipLimited) return isForm(req) ? redirect("/support?error=rate_limited#contact") : ipLimited;
    const viewer = await getViewer(req.headers);
    if (viewer.kind !== "anonymous") {
      const userLimited = await limited(`support_ticket:user:${viewer.user.id}`, limits.ticketsPerUser);
      if (userLimited) return isForm(req) ? redirect("/support?error=rate_limited#contact") : userLimited;
    }
    try {
      const r = await createTicket(viewer, {
        subject: str(body.subject),
        message: str(body.message),
        email: str(body.email),
        category: str(body.category),
        source: body.source === "chat" ? "chat" : "form",
      });
      const page = r.ticket.user_id ? `/support/tickets/${r.ticket.id}?created=1` : `/support/tickets/${r.ticket.id}?t=${encodeURIComponent(r.token)}&created=1`;
      if (isForm(req)) return redirect(page);
      return json(201, { id: r.ticket.id, status: r.ticket.status, escalated: r.ticket.escalated, category: r.ticket.category, url: page });
    } catch (err) {
      return errorResponse(req, err, "/support#contact");
    }
  }

  async function handleCustomerAction(req: Request, id: string, action: "reply" | "resolve"): Promise<Response> {
    const ip = getClientIp(req.headers, o.clientIp);
    const ipLimited = await limited(`support_reply:${rateLimitKeyForIp(ip)}`, limits.repliesPerIp);
    if (ipLimited) return ipLimited;
    const body = await readBody(req);
    if (!body) return json(400, { error: "invalid_body", message: "Invalid request." });
    const token = str(body.t) || new URL(req.url).searchParams.get("t");
    const access = await resolveAccess(req.headers, id, token);
    if (!access) return json(404, { error: "not_found", message: "Not found" });
    const back = `/support/tickets/${id}${access.via === "token" ? `?t=${encodeURIComponent(access.token!)}` : ""}`;
    try {
      if (action === "reply") await customerReply(access, str(body.message));
      else await customerResolve(access);
      return isForm(req) ? redirect(`${back}${back.includes("?") ? "&" : "?"}updated=1`) : json(200, { ok: true });
    } catch (err) {
      return errorResponse(req, err, back);
    }
  }

  async function handleAdmin(req: Request, id: string, action: "reply" | "status"): Promise<Response> {
    const operator = await isOperator(req.headers);
    if (!operator) return json(404, { error: "not_found", message: "Not found" });
    const body = await readBody(req);
    if (!body) return json(400, { error: "invalid_body", message: "Invalid request." });
    const back = `${adminPath}/${id}`;
    try {
      if (action === "reply") {
        const next = isStatus(body.status) ? body.status : "waiting_on_customer";
        await operatorReply(operator, id, str(body.message), next);
      } else {
        if (!isStatus(body.status)) throw new SupportError(400, "invalid_status", "Unknown status.");
        await operatorSetStatus(id, body.status);
      }
      return isForm(req) ? redirect(`${back}?msg=saved`) : json(200, { ok: true });
    } catch (err) {
      return errorResponse(req, err, back);
    }
  }

  /** Mount at app/api/support/[...path]/route.ts for GET and POST. */
  async function handle(req: Request, path: string[]): Promise<Response> {
    const method = req.method.toUpperCase();
    const p = path.join("/");
    if (method === "GET") {
      if (p === "search") {
        const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
        await ensureArticles();
        return json(200, { results: (await searchArticles(ex, q, 10)).map(link) });
      }
      return json(404, { error: "not_found", message: "Not found" });
    }
    if (method !== "POST") return json(405, { error: "method_not_allowed", message: "Method not allowed" }, { allow: "GET, POST" });
    if (!isSameOrigin(req)) return json(403, { error: "cross_origin", message: "Cross-origin requests are not allowed." });
    try {
      if (p === "chat") return await handleChat(req);
      if (p === "tickets") return await handleCreate(req);
      let m = /^tickets\/([^/]+)\/(reply|resolve)$/.exec(p);
      if (m) return await handleCustomerAction(req, m[1]!, m[2] as "reply" | "resolve");
      m = /^admin\/tickets\/([^/]+)\/(reply|status)$/.exec(p);
      if (m) return await handleAdmin(req, m[1]!, m[2] as "reply" | "status");
      return json(404, { error: "not_found", message: "Not found" });
    } catch (err) {
      return errorResponse(req, err, "/support");
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Page helpers (server components)
  // ----------------------------------------------------------------------------------------------
  async function ticketsForViewer(headers: Headers): Promise<{ viewer: Viewer; tickets: PublicTicket[] }> {
    const viewer = await getViewer(headers);
    if (viewer.kind !== "member") return { viewer, tickets: [] };
    return { viewer, tickets: await listTicketsForMember(ex, { orgId: viewer.orgId, userId: viewer.user.id, seeAll: viewer.seeAll }) };
  }

  async function ticketForViewer(headers: Headers, id: string, token?: string | null): Promise<{ ticket: PublicTicket; messages: MessageRow[]; via: "member" | "token"; token?: string } | null> {
    const access = await resolveAccess(headers, id, token);
    if (!access) return null;
    return { ticket: toPublic(access.ticket), messages: await listMessages(ex, id), via: access.via, token: access.token };
  }

  async function adminTicket(id: string): Promise<{ ticket: PublicTicket; messages: MessageRow[] } | null> {
    const t = await getTicketRaw(ex, id);
    if (!t) return null;
    return { ticket: toPublic(t), messages: await listMessages(ex, id) };
  }

  return {
    app: o.app,
    brand: o.brand,
    aiEnabled: Boolean(aiClient),
    model,
    budget,
    jobs,
    schedules,
    handle,
    ensureArticles,
    syncArticles: syncFromDisk,
    listArticles: async () => {
      await ensureArticles();
      return listArticles(ex);
    },
    getArticle: async (slug: string) => {
      await ensureArticles();
      return getArticle(ex, slug);
    },
    searchArticles: async (q: string, limit = 10) => {
      await ensureArticles();
      return searchArticles(ex, q, limit);
    },
    articleSlugs: async () => {
      await ensureArticles();
      return articleSlugs(ex);
    },
    answer,
    getViewer,
    isOperator,
    createTicket,
    resolveAccess,
    customerReply,
    customerResolve,
    operatorReply,
    operatorSetStatus,
    firstAnswer,
    autoClose,
    ticketsForViewer,
    ticketForViewer,
    adminQueue: (f?: QueueFilter) => listQueue(ex, f),
    adminCounts: () => queueCounts(ex),
    adminTicket,
    budgetStatus: () => budgetStatus(ex, budget, now()),
    purge: (orgIds: string[], userId?: string) => purgeSupportData(ex, { orgIds, userId }),
  };
}

function publicReason(reason: string | undefined): string {
  switch (reason) {
    case "ai_not_configured":
    case "budget_exhausted":
    case "ai_busy":
      return "The assistant is not available right now, so here are the closest help articles.";
    case "no_matching_articles":
      return "I could not find a help article about that.";
    default:
      return "I'm not sure about that one. These articles may help, or you can ask a person.";
  }
}

export type Support = ReturnType<typeof createSupport>;
