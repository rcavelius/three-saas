/**
 * Branded transactional email rendering. Inline styles only (email clients strip <style>), every
 * interpolated value HTML-escaped, links restricted to http(s).
 */
import type { Brand, EmailMessage, Severity } from "./types";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Returns the URL if it is absolute http(s), otherwise null (blocks javascript:, data:, etc.). */
export function safeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function brandColor(c: string | undefined): string {
  return c && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : "#2563eb";
}

/** Removes CR/LF so values can never break out of a header line (subjects, tags). */
function oneLine(s: string, max = 200): string {
  return s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export interface EmailContent {
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
}

export function renderBrandedEmail(brand: Brand, c: EmailContent): { html: string; text: string } {
  const color = brandColor(brand.primaryColor);
  const brandUrl = safeUrl(brand.url);
  const actionUrl = c.action ? safeUrl(c.action.url) : null;
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const footerLines = [
    c.footer,
    brand.supportEmail ? `Questions? Reply or write to ${brand.supportEmail}.` : undefined,
    brand.postalAddress,
  ].filter((x): x is string => Boolean(x));

  const paragraphsHtml = c.paragraphs
    .map((p) => `<p style="margin:0 0 16px;${font}font-size:16px;line-height:1.5;color:#1f2937;">${escapeHtml(p)}</p>`)
    .join("\n");
  const buttonHtml =
    c.action && actionUrl
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:${color};color:#ffffff;${font}font-size:16px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:6px;">${escapeHtml(c.action.label)}</a></p>
<p style="margin:0 0 16px;${font}font-size:13px;line-height:1.5;color:#6b7280;">Or open this link: ${escapeHtml(actionUrl)}</p>`
      : "";
  const brandHtml = brandUrl
    ? `<a href="${escapeHtml(brandUrl)}" style="color:${color};text-decoration:none;">${escapeHtml(brand.name)}</a>`
    : escapeHtml(brand.name);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border-top:4px solid ${color};">
<tr><td style="padding:24px 32px 0;${font}font-size:18px;font-weight:700;">${brandHtml}</td></tr>
<tr><td style="padding:16px 32px 8px;">
<h1 style="margin:0 0 16px;${font}font-size:22px;line-height:1.3;color:#111827;">${escapeHtml(c.heading)}</h1>
${paragraphsHtml}
${buttonHtml}
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;${font}font-size:12px;line-height:1.5;color:#6b7280;">${footerLines.map(escapeHtml).join("<br>")}</td></tr>
</table></td></tr></table>
</body></html>`;

  const text = [
    brand.name,
    "",
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.action && actionUrl ? [`${c.action.label}: ${actionUrl}`, ""] : []),
    ...(footerLines.length ? ["--", ...footerLines] : []),
  ]
    .join("\n")
    .trim();

  return { html, text };
}

function message(to: string, subject: string, tag: string, brand: Brand, c: EmailContent): EmailMessage {
  const { html, text } = renderBrandedEmail(brand, c);
  return { to, subject: oneLine(subject), tag, html, text };
}

export function formatMoney(cents: number, currency = "usd"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

const dateFmt = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(d) + " (UTC)";

export function welcomeEmail(brand: Brand, d: { to: string; name?: string; dashboardUrl: string }): EmailMessage {
  return message(d.to, `Welcome to ${brand.name}`, "welcome", brand, {
    heading: `Welcome to ${brand.name}${d.name ? `, ${d.name}` : ""}`,
    paragraphs: [
      "Your account is ready. You are on the free plan, so you can start right away; no card needed.",
      "If you did not create this account, you can ignore this email.",
    ],
    action: { label: "Open your dashboard", url: d.dashboardUrl },
  });
}

export function paymentFailedEmail(
  brand: Brand,
  d: { to: string; amountDueCents: number; currency?: string; portalUrl: string; nextAttemptAt?: Date | null },
): EmailMessage {
  return message(d.to, `Action needed: your ${brand.name} payment failed`, "payment_failed", brand, {
    heading: "Your payment did not go through",
    paragraphs: [
      `We could not charge ${formatMoney(d.amountDueCents, d.currency)} for your ${brand.name} subscription.`,
      d.nextAttemptAt
        ? `We will try again on ${dateFmt(d.nextAttemptAt)}. Updating your card before then keeps your plan active.`
        : "Please update your payment method to keep your plan active.",
    ],
    action: { label: "Update payment method", url: d.portalUrl },
  });
}

export function subscriptionCanceledEmail(
  brand: Brand,
  d: { to: string; planName: string; accessUntil?: Date | null; billingUrl: string },
): EmailMessage {
  return message(d.to, `Your ${brand.name} subscription was canceled`, "subscription_canceled", brand, {
    heading: "Your subscription was canceled",
    paragraphs: [
      d.accessUntil
        ? `Your ${d.planName} plan stays active until ${dateFmt(d.accessUntil)}, then your account moves to the free plan.`
        : `Your ${d.planName} plan has ended and your account is now on the free plan.`,
      "Your data is kept. You can resubscribe at any time.",
    ],
    action: { label: "Manage billing", url: d.billingUrl },
  });
}

export function planChangedEmail(
  brand: Brand,
  d: { to: string; fromPlan: string; toPlan: string; billingUrl: string },
): EmailMessage {
  return message(d.to, `Your ${brand.name} plan changed to ${d.toPlan}`, "plan_changed", brand, {
    heading: `You are now on the ${d.toPlan} plan`,
    paragraphs: [`Your plan changed from ${d.fromPlan} to ${d.toPlan}. New limits apply right away.`],
    action: { label: "View billing", url: d.billingUrl },
  });
}

export function usageNearLimitEmail(
  brand: Brand,
  d: { to: string; metricLabel: string; used: number; limit: number; upgradeUrl: string },
): EmailMessage {
  const pct = d.limit > 0 ? Math.floor((d.used / d.limit) * 100) : 100;
  return message(d.to, `You have used ${pct}% of your ${d.metricLabel} on ${brand.name}`, "usage_near_limit", brand, {
    heading: `${pct}% of your ${d.metricLabel} used`,
    paragraphs: [
      `You have used ${d.used} of ${d.limit} ${d.metricLabel} this billing period.`,
      "When you reach the limit, new work pauses until the next period. Upgrading raises the limit immediately.",
    ],
    action: { label: "See plans", url: d.upgradeUrl },
  });
}

export function alertEmail(
  brand: Brand,
  d: {
    to: string;
    title: string;
    severity: Severity;
    summary: string;
    facts?: Record<string, string | number | boolean | null>;
    dashboardUrl?: string;
  },
): EmailMessage {
  const facts = Object.entries(d.facts ?? {}).map(([k, v]) => `${k}: ${String(v)}`);
  return message(d.to, `[${brand.name}] ${d.severity.toUpperCase()}: ${d.title}`, `alert_${d.severity}`, brand, {
    heading: d.title,
    paragraphs: [d.summary, ...facts],
    action: d.dashboardUrl ? { label: "Open ops dashboard", url: d.dashboardUrl } : undefined,
    footer: `You receive this because you are the owner alert contact for ${brand.name}.`,
  });
}
