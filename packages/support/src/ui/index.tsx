/**
 * Server-renderable support UI (no hooks, no client JS). Apps wrap these in their own page chrome and set
 * the CSS variables in support.css (--sup-accent etc.) to their brand. Markdown is rendered from an AST to
 * React elements, so article text can never inject HTML.
 */
import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../markdown";
import { CATEGORIES, CATEGORY_LABELS, STATUSES, STATUS_LABELS, type Category, type TicketStatus } from "../types";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const formatDate = (d: Date | string) => `${dateFmt.format(new Date(d))} UTC`;

function renderInline(nodes: Inline[], key = "i"): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}-${i}`;
    switch (n.type) {
      case "text":
        return n.text;
      case "code":
        return <code key={k}>{n.text}</code>;
      case "strong":
        return <strong key={k}>{renderInline(n.children, k)}</strong>;
      case "em":
        return <em key={k}>{renderInline(n.children, k)}</em>;
      case "link": {
        const external = /^https?:/.test(n.href);
        return (
          <a key={k} href={n.href} {...(external ? { rel: "noopener noreferrer nofollow" } : {})}>
            {renderInline(n.children, k)}
          </a>
        );
      }
    }
  });
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.type) {
    case "heading":
      return b.level === 2 ? (
        <h2 key={i} id={b.id}>
          {renderInline(b.children)}
        </h2>
      ) : (
        <h3 key={i} id={b.id}>
          {renderInline(b.children)}
        </h3>
      );
    case "paragraph":
      return <p key={i}>{renderInline(b.children)}</p>;
    case "code":
      return (
        // Focusable so keyboard users can scroll long lines (axe: scrollable-region-focusable).
        <pre key={i} tabIndex={0}>
          <code>{b.text}</code>
        </pre>
      );
    case "list": {
      const items = b.items.map((it, j) => <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>);
      return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
    }
  }
}

export function HelpMarkdown({ markdown }: { markdown: string }) {
  return <div className="sup-md">{parseMarkdown(markdown).map(renderBlock)}</div>;
}

/** Plain text with paragraphs/line breaks preserved (ticket messages are never parsed as Markdown). */
export function PlainText({ text }: { text: string }) {
  return (
    <div className="sup-plain">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

export interface ArticleCard {
  slug: string;
  title: string;
  summary: string;
  category: string;
}

export function HelpSearchForm({ q = "", action = "/help" }: { q?: string; action?: string }) {
  return (
    <form className="sup-search" role="search" action={action} method="get">
      <label htmlFor="sup-help-q" className="sup-label">
        Search the help center
      </label>
      <div className="sup-row">
        <input id="sup-help-q" name="q" type="search" defaultValue={q} maxLength={200} placeholder="e.g. cancel my plan" className="sup-input" />
        <button type="submit" className="sup-button">
          Search
        </button>
      </div>
    </form>
  );
}

export function ArticleList({ articles, empty = "No articles found." }: { articles: ArticleCard[]; empty?: string }) {
  if (articles.length === 0) return <p className="sup-muted">{empty}</p>;
  return (
    <ul className="sup-cards">
      {articles.map((a) => (
        <li key={a.slug} className="sup-card">
          <a href={`/help/${a.slug}`} className="sup-card-title">
            {a.title}
          </a>
          <p className="sup-muted">{a.summary}</p>
        </li>
      ))}
    </ul>
  );
}

/** Articles grouped by category, in the order categories first appear. */
export function ArticlesByCategory({ articles }: { articles: ArticleCard[] }) {
  const groups = new Map<string, ArticleCard[]>();
  for (const a of articles) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
  return (
    <div className="sup-groups">
      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} aria-labelledby={`cat-${cat.replace(/\W+/g, "-")}`}>
          <h2 id={`cat-${cat.replace(/\W+/g, "-")}`} className="sup-h2">
            {cat}
          </h2>
          <ArticleList articles={list} />
        </section>
      ))}
    </div>
  );
}

const ERRORS: Record<string, string> = {
  subject_required: "Please add a short subject (at least 3 characters).",
  message_required: "Please describe the problem (at least 10 characters).",
  message_too_long: "Please keep the message under 5,000 characters.",
  email_required: "Please enter a valid email address so we can reply.",
  rate_limited: "Too many requests from your connection. Please wait a little and try again.",
  ticket_closed: "This request is closed. Please open a new one.",
};

export function errorMessage(code: string | undefined | null): string | null {
  if (!code) return null;
  return ERRORS[code] ?? "Something went wrong. Please try again.";
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: ReactNode }) {
  return (
    <div className={`sup-notice sup-notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** The ticket form. A plain HTML form (works without JavaScript); the chat can prefill it. */
export function TicketForm({ signedInEmail, error }: { signedInEmail?: string | null; error?: string | null }) {
  const err = errorMessage(error);
  return (
    <form className="sup-form" action="/api/support/tickets" method="post" id="sup-ticket-form">
      {err && <Notice kind="error">{err}</Notice>}
      {signedInEmail ? (
        <p className="sup-muted">
          We will reply to <strong>{signedInEmail}</strong>.
        </p>
      ) : (
        <div className="sup-field">
          <label htmlFor="sup-email" className="sup-label">
            Your email
          </label>
          <input id="sup-email" name="email" type="email" required maxLength={254} autoComplete="email" className="sup-input" />
        </div>
      )}
      <div className="sup-field">
        <label htmlFor="sup-category" className="sup-label">
          Topic
        </label>
        <select id="sup-category" name="category" className="sup-input" defaultValue="how-to">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="sup-field">
        <label htmlFor="sup-subject" className="sup-label">
          Subject
        </label>
        <input id="sup-subject" name="subject" required minLength={3} maxLength={200} className="sup-input" />
      </div>
      <div className="sup-field">
        <label htmlFor="sup-message" className="sup-label">
          How can we help?
        </label>
        <textarea id="sup-message" name="message" required minLength={10} maxLength={5000} rows={6} className="sup-input" />
        <p className="sup-hint">Please don&apos;t include passwords or full card numbers.</p>
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div className="sup-hp" aria-hidden="true">
        <label htmlFor="sup-website">Website</label>
        <input id="sup-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="source" id="sup-source" value="form" />
      <button type="submit" className="sup-button">
        Send to support
      </button>
    </form>
  );
}

export interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  category: Category;
  priority?: string;
  escalated?: boolean;
  email?: string;
  updated_at: Date | string;
  created_at: Date | string;
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`sup-badge sup-badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function TicketTable({ tickets, hrefFor }: { tickets: TicketSummary[]; hrefFor: (t: TicketSummary) => string }) {
  if (tickets.length === 0) return <p className="sup-muted">No requests yet.</p>;
  return (
    <ul className="sup-tickets">
      {tickets.map((t) => (
        <li key={t.id} className="sup-ticket-row">
          <a href={hrefFor(t)} className="sup-card-title">
            {t.subject}
          </a>
          <span className="sup-meta">
            <StatusBadge status={t.status} /> {CATEGORY_LABELS[t.category]} · #{t.id.slice(0, 8)} · updated {formatDate(t.updated_at)}
            {t.escalated ? " · needs a person" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface ThreadMessage {
  id: string;
  author: "customer" | "operator" | "assistant" | "system";
  body: string;
  automated: boolean;
  created_at: Date | string;
}

const AUTHOR_LABEL = { customer: "You", operator: "Support team", assistant: "Automated answer", system: "Update" } as const;

export function TicketThread({ messages, perspective = "customer" }: { messages: ThreadMessage[]; perspective?: "customer" | "operator" }) {
  return (
    <ol className="sup-thread" aria-label="Messages">
      {messages.map((m) => (
        <li key={m.id} className={`sup-msg sup-msg-${m.author}`}>
          <p className="sup-meta">
            <strong>{perspective === "operator" && m.author === "customer" ? "Customer" : AUTHOR_LABEL[m.author]}</strong> · {formatDate(m.created_at)}
            {m.automated && m.author === "assistant" ? " · drafted from help articles, not reviewed by a person" : ""}
          </p>
          <PlainText text={m.body} />
        </li>
      ))}
    </ol>
  );
}

/** Customer reply + resolve forms (plain HTML; the token travels as a hidden field). */
export function CustomerTicketActions({ ticketId, status, token, error }: { ticketId: string; status: TicketStatus; token?: string; error?: string | null }) {
  if (status === "closed") return <Notice>This request is closed. If you still need help, <a href="/support#contact">open a new request</a>.</Notice>;
  const err = errorMessage(error);
  return (
    <div className="sup-actions">
      {err && <Notice kind="error">{err}</Notice>}
      <form action={`/api/support/tickets/${ticketId}/reply`} method="post" className="sup-form">
        {token && <input type="hidden" name="t" value={token} />}
        <div className="sup-field">
          <label htmlFor="sup-reply" className="sup-label">
            Add a reply
          </label>
          <textarea id="sup-reply" name="message" required maxLength={5000} rows={4} className="sup-input" />
        </div>
        <button type="submit" className="sup-button">
          Send reply
        </button>
      </form>
      {status !== "resolved" && (
        <form action={`/api/support/tickets/${ticketId}/resolve`} method="post">
          {token && <input type="hidden" name="t" value={token} />}
          <button type="submit" className="sup-button sup-button-secondary">
            Mark as resolved
          </button>
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Operator UI
// ------------------------------------------------------------------------------------------------

export function AdminQueueFilters({ status, priority, category, action }: { status?: string; priority?: string; category?: string; action: string }) {
  return (
    <form method="get" action={action} className="sup-filters">
      <label className="sup-label">
        Status
        <select name="status" defaultValue={status ?? "active"} className="sup-input">
          <option value="active">Active (not resolved)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="sup-label">
        Priority
        <select name="priority" defaultValue={priority ?? ""} className="sup-input">
          <option value="">Any</option>
          <option value="high">high</option>
          <option value="normal">normal</option>
          <option value="low">low</option>
        </select>
      </label>
      <label className="sup-label">
        Category
        <select name="category" defaultValue={category ?? ""} className="sup-input">
          <option value="">Any</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="sup-button">
        Filter
      </button>
    </form>
  );
}

export function AdminQueueTable({ tickets, basePath }: { tickets: TicketSummary[]; basePath: string }) {
  if (tickets.length === 0) return <p className="sup-muted">No tickets match.</p>;
  return (
    <div className="sup-table-wrap">
      <table className="sup-table">
        <thead>
          <tr>
            <th scope="col">Subject</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Category</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className={t.escalated ? "sup-escalated" : undefined}>
              <td>
                <a href={`${basePath}/${t.id}`}>{t.subject}</a>
                {t.escalated ? <span className="sup-badge sup-badge-escalated">escalated</span> : null}
              </td>
              <td>{t.status.replace(/_/g, " ")}</td>
              <td>{t.priority}</td>
              <td>{CATEGORY_LABELS[t.category]}</td>
              <td>{formatDate(t.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminTicketActions({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  return (
    <div className="sup-actions">
      <form action={`/api/support/admin/tickets/${ticketId}/reply`} method="post" className="sup-form">
        <div className="sup-field">
          <label htmlFor="sup-op-reply" className="sup-label">
            Reply to the customer (emailed)
          </label>
          <textarea id="sup-op-reply" name="message" required maxLength={10000} rows={6} className="sup-input" />
        </div>
        <div className="sup-field">
          <label htmlFor="sup-op-next" className="sup-label">
            Then set status to
          </label>
          <select id="sup-op-next" name="status" defaultValue="waiting_on_customer" className="sup-input">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="sup-button">
          Send reply
        </button>
      </form>
      <form action={`/api/support/admin/tickets/${ticketId}/status`} method="post" className="sup-row">
        <label htmlFor="sup-op-status" className="sup-label">
          Change status
        </label>
        <select id="sup-op-status" name="status" defaultValue={status} className="sup-input">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button type="submit" className="sup-button sup-button-secondary">
          Save status
        </button>
      </form>
    </div>
  );
}

/** schema.org Article JSON-LD; `<` is escaped so the payload cannot close the script element. */
export function articleJsonLd(o: { title: string; summary: string; url: string; updated: string; publisher: string }): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: o.title,
    description: o.summary,
    dateModified: o.updated,
    mainEntityOfPage: o.url,
    publisher: { "@type": "Organization", name: o.publisher },
  }).replace(/</g, "\\u003c");
}
