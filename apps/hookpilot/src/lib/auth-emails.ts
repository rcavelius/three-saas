import type { AuthEmailTemplates } from "@repo/auth";
import { renderBrandedEmail, type Brand } from "@repo/ops";

/** HookPilot-branded auth emails (escaped and inline-styled by @repo/ops renderBrandedEmail). */
export function authEmailTemplates(brand: Brand): AuthEmailTemplates {
  return {
    verifyEmail: ({ url }) => ({
      subject: "Confirm your email for HookPilot",
      ...renderBrandedEmail(brand, {
        heading: "Confirm your email address",
        paragraphs: [
          "Confirm this address to finish creating your HookPilot account. The link works for one hour.",
          "If you did not sign up for HookPilot, ignore this email; no account is activated without the confirmation.",
        ],
        action: { label: "Confirm email", url },
      }),
    }),
    resetPassword: ({ url }) => ({
      subject: "Reset your HookPilot password",
      ...renderBrandedEmail(brand, {
        heading: "Reset your password",
        paragraphs: [
          "Someone (hopefully you) asked to reset the password of your HookPilot account. The link works for one hour.",
          "Resetting signs out every other session. If you did not ask for this, ignore this email; your password stays the same.",
        ],
        action: { label: "Choose a new password", url },
      }),
    }),
    invitation: ({ url, inviterName, inviterEmail, organizationName, role }) => ({
      subject: `${inviterName} invited you to ${organizationName} on HookPilot`,
      ...renderBrandedEmail(brand, {
        heading: `Join ${organizationName} on HookPilot`,
        paragraphs: [
          `${inviterName} (${inviterEmail}) invited you to the "${organizationName}" workspace as ${role}.`,
          "Members see the workspace's webhook endpoints and captured requests. The invitation expires in 7 days.",
        ],
        action: { label: "Accept invitation", url },
      }),
    }),
  };
}
