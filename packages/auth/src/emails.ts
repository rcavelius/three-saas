/**
 * Default transactional email templates for auth flows.
 *
 * Plain, accessible emails: a text part that reads well on its own, and a simple single-column
 * HTML part (real <a> link styled as a button, the raw URL repeated as text, lang attribute,
 * no images, no tracking). Every interpolated value is HTML-escaped. Apps override any template
 * via `createAuth({ emailTemplates })` for branding.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable machine tag for the outbox / provider analytics, e.g. "auth.verify-email". */
  tag: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface VerifyEmailData {
  appName: string;
  url: string;
  user: { name: string; email: string };
}
export interface ResetPasswordData {
  appName: string;
  url: string;
  user: { name: string; email: string };
}
export interface InvitationData {
  appName: string;
  url: string;
  email: string;
  inviterName: string;
  inviterEmail: string;
  organizationName: string;
  role: string;
}

export interface AuthEmailTemplates {
  verifyEmail(data: VerifyEmailData): RenderedEmail;
  resetPassword(data: ResetPasswordData): RenderedEmail;
  invitation(data: InvitationData): RenderedEmail;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** Strips CR/LF so user-controlled values can never inject extra lines into subjects. */
function oneLine(value: string): string {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function layout(opts: { appName: string; heading: string; paragraphs: string[]; buttonLabel: string; url: string; footer: string }): string {
  const app = escapeHtml(opts.appName);
  const url = escapeHtml(opts.url);
  const paragraphs = opts.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933;">${p}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;">
<div role="article" aria-label="${escapeHtml(opts.heading)}" style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 24px;font-size:14px;font-weight:600;color:#52606d;">${app}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f2933;">${escapeHtml(opts.heading)}</h1>
${paragraphs}
<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">${escapeHtml(opts.buttonLabel)}</a></p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#52606d;">If the button does not work, copy this link into your browser:<br><a href="${url}" style="color:#1d4ed8;word-break:break-all;">${url}</a></p>
<p style="margin:32px 0 0;font-size:13px;line-height:1.5;color:#7b8794;">${escapeHtml(opts.footer)}</p>
</div>
</body>
</html>`;
}

export const defaultEmailTemplates: AuthEmailTemplates = {
  verifyEmail({ appName, url, user }) {
    const subject = `Confirm your email for ${oneLine(appName)}`;
    const greeting = user.name ? `Hi ${oneLine(user.name)},` : "Hi,";
    const text = [
      greeting,
      "",
      `Please confirm your email address to finish creating your ${appName} account:`,
      url,
      "",
      "The link expires in 1 hour. If you did not sign up, you can ignore this email.",
      "",
      `- ${appName}`,
    ].join("\n");
    const html = layout({
      appName,
      heading: "Confirm your email address",
      paragraphs: [escapeHtml(greeting), `Please confirm your email address to finish creating your ${escapeHtml(appName)} account.`],
      buttonLabel: "Confirm email address",
      url,
      footer: "The link expires in 1 hour. If you did not sign up, you can ignore this email.",
    });
    return { subject, text, html };
  },

  resetPassword({ appName, url, user }) {
    const subject = `Reset your ${oneLine(appName)} password`;
    const greeting = user.name ? `Hi ${oneLine(user.name)},` : "Hi,";
    const text = [
      greeting,
      "",
      `Someone asked to reset the password for your ${appName} account. Use this link to choose a new one:`,
      url,
      "",
      "The link expires in 1 hour. Resetting signs you out on all other devices. If you did not ask for this, ignore this email; your password stays the same.",
      "",
      `- ${appName}`,
    ].join("\n");
    const html = layout({
      appName,
      heading: "Reset your password",
      paragraphs: [
        escapeHtml(greeting),
        `Someone asked to reset the password for your ${escapeHtml(appName)} account. Use the button below to choose a new one.`,
      ],
      buttonLabel: "Choose a new password",
      url,
      footer:
        "The link expires in 1 hour. Resetting signs you out on all other devices. If you did not ask for this, ignore this email; your password stays the same.",
    });
    return { subject, text, html };
  },

  invitation({ appName, url, inviterName, inviterEmail, organizationName, role }) {
    const subject = `${oneLine(inviterName || inviterEmail)} invited you to ${oneLine(organizationName)} on ${oneLine(appName)}`;
    const text = [
      "Hi,",
      "",
      `${inviterName || inviterEmail} (${inviterEmail}) invited you to join "${organizationName}" on ${appName} as ${role}.`,
      "Accept the invitation here:",
      url,
      "",
      "If you were not expecting this invitation, you can ignore this email.",
      "",
      `- ${appName}`,
    ].join("\n");
    const html = layout({
      appName,
      heading: `Join ${organizationName} on ${appName}`,
      paragraphs: [
        "Hi,",
        `${escapeHtml(inviterName || inviterEmail)} (${escapeHtml(inviterEmail)}) invited you to join <strong>${escapeHtml(organizationName)}</strong> on ${escapeHtml(appName)} as ${escapeHtml(role)}.`,
      ],
      buttonLabel: "Accept invitation",
      url,
      footer: "If you were not expecting this invitation, you can ignore this email.",
    });
    return { subject, text, html };
  },
};
