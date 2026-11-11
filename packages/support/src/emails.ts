/** App-branded ticket emails (rendered by @repo/ops, fully escaped). Bodies never promise outcomes. */
import { renderBrandedEmail, type Brand, type EmailMessage } from "@repo/ops";
import { CATEGORY_LABELS, STATUS_LABELS, type Category, type TicketStatus } from "./types";

function msg(to: string, subject: string, tag: string, brand: Brand, heading: string, paragraphs: string[], link: { label: string; url: string }): EmailMessage {
  const { html, text } = renderBrandedEmail(brand, {
    heading,
    paragraphs,
    action: link,
    footer: "Keep this link private: anyone with it can read and reply to this request.",
  });
  return { to, subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200), tag, html, text };
}

const ref = (id: string) => `#${id.slice(0, 8)}`;
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function ticketReceivedEmail(brand: Brand, d: { to: string; ticketId: string; subject: string; url: string }): EmailMessage {
  return msg(d.to, `We received your request ${ref(d.ticketId)}: ${clip(d.subject)}`, "support.ticket_received", brand, "We received your request", [
    `Thanks for contacting ${brand.name}. Your request "${clip(d.subject, 120)}" is open as ${ref(d.ticketId)}.`,
    "You can read replies, add details or mark it resolved from the link below. We will also email you when there is a reply.",
  ], { label: "View your request", url: d.url });
}

export function ticketEscalatedEmail(brand: Brand, d: { to: string; ticketId: string; subject: string; reason: string; url: string }): EmailMessage {
  return msg(d.to, `A person will handle your request ${ref(d.ticketId)}`, "support.ticket_escalated", brand, "A person will handle this", [
    `Thanks for contacting ${brand.name}. Your request "${clip(d.subject, 120)}" (${ref(d.ticketId)}) looks like a ${d.reason.toLowerCase()}, so it has been passed to a person on our team rather than handled automatically.`,
    "No automated decision will be made on it. We will reply by email; you can add details at any time from the link below.",
  ], { label: "View your request", url: d.url });
}

export function operatorAlertEmail(brand: Brand, d: { to: string; ticketId: string; category: Category; reason: string; adminUrl: string }): EmailMessage {
  return msg(d.to, `[${brand.name}] Escalated support ticket ${ref(d.ticketId)}: ${d.reason}`, "support.operator_alert", brand, "Escalated support ticket", [
    `A ticket in category "${CATEGORY_LABELS[d.category]}" needs a person: ${d.reason}.`,
    "Open the support queue to read it. The customer was told a person will handle it; no outcome was promised.",
  ], { label: "Open in admin", url: d.adminUrl });
}

export function ticketReplyEmail(brand: Brand, d: { to: string; ticketId: string; subject: string; body: string; automated: boolean; url: string }): EmailMessage {
  return msg(
    d.to,
    `${d.automated ? "Suggested answer" : "New reply"} on your request ${ref(d.ticketId)}`,
    d.automated ? "support.ticket_auto_answer" : "support.ticket_reply",
    brand,
    d.automated ? "A suggested answer from our help articles" : "You have a new reply",
    [
      ...(d.automated ? ["This answer was put together automatically from our help articles. If it does not solve the problem, just reply and a person will follow up."] : []),
      ...d.body.split(/\n{2,}/).slice(0, 30),
      d.automated ? "If this solved it, you can mark the request resolved." : "Reply from the link below.",
    ],
    { label: "View and reply", url: d.url },
  );
}

export function ticketStatusEmail(brand: Brand, d: { to: string; ticketId: string; status: TicketStatus; url: string }): EmailMessage {
  return msg(d.to, `Your request ${ref(d.ticketId)} is now: ${STATUS_LABELS[d.status]}`, "support.ticket_status", brand, `Request ${ref(d.ticketId)}: ${STATUS_LABELS[d.status]}`, [
    d.status === "resolved"
      ? "If something is still wrong, reply from the link below and the request will reopen."
      : d.status === "closed"
        ? "This request is closed. If you still need help, please open a new request."
        : "You can follow the request from the link below.",
  ], { label: "View your request", url: d.url });
}

export function ticketAutoClosedEmail(brand: Brand, d: { to: string; ticketId: string; url: string }): EmailMessage {
  return msg(d.to, `Your request ${ref(d.ticketId)} was closed`, "support.ticket_auto_closed", brand, "We closed your request", [
    "We had not heard back for 7 days, so this request was closed automatically.",
    "If you still need help, open a new request; you can link to this one.",
  ], { label: "View the request", url: d.url });
}
