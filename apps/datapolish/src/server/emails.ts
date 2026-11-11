/** DataPolish-branded auth emails, rendered with the shared ops email layout (escaped, inline styles). */
import type { AuthEmailTemplates } from "@repo/auth";
import { renderBrandedEmail, type Brand } from "@repo/ops";

function oneLine(s: string): string {
  return String(s).replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

export function authEmailTemplates(brand: Brand): AuthEmailTemplates {
  return {
    verifyEmail({ url, user }) {
      const { html, text } = renderBrandedEmail(brand, {
        heading: "Confirm your email address",
        paragraphs: [
          user.name ? `Hi ${oneLine(user.name)},` : "Hi,",
          `Confirm your email to finish creating your ${brand.name} account. Your account stores saved workflows and billing; your spreadsheets are still processed only in your browser.`,
        ],
        action: { label: "Confirm email address", url },
        footer: "The link expires in 1 hour. If you did not sign up, you can ignore this email.",
      });
      return { subject: `Confirm your email for ${brand.name}`, html, text };
    },
    resetPassword({ url, user }) {
      const { html, text } = renderBrandedEmail(brand, {
        heading: "Reset your password",
        paragraphs: [
          user.name ? `Hi ${oneLine(user.name)},` : "Hi,",
          `Someone asked to reset the password for your ${brand.name} account. Use the button to choose a new one. Resetting signs you out on all devices.`,
        ],
        action: { label: "Choose a new password", url },
        footer: "The link expires in 1 hour. If you did not ask for this, ignore this email; your password stays the same.",
      });
      return { subject: `Reset your ${brand.name} password`, html, text };
    },
    invitation({ url, inviterName, inviterEmail, organizationName, role }) {
      const who = oneLine(inviterName || inviterEmail);
      const { html, text } = renderBrandedEmail(brand, {
        heading: `Join ${oneLine(organizationName)} on ${brand.name}`,
        paragraphs: [`${who} (${oneLine(inviterEmail)}) invited you to join "${oneLine(organizationName)}" on ${brand.name} as ${oneLine(role)}. You will share the team's saved workflows.`],
        action: { label: "Accept invitation", url },
        footer: "The invitation expires in 7 days. If you were not expecting it, you can ignore this email.",
      });
      return { subject: `${who} invited you to ${oneLine(organizationName)} on ${brand.name}`, html, text };
    },
  };
}
