export { AUTH_MIGRATIONS } from "./migrations";
export { createAuth, buildAuthOptions, highestRole, personalOrgSlug, CLIENT_IP_HEADER } from "./auth";
export type { AppAuth, AuthSession, CreateAuthOptions, OrgRole } from "./auth";
export { AuthError, isAuthError } from "./errors";
export type { AuthErrorStatus } from "./errors";
export { defaultEmailTemplates, escapeHtml } from "./emails";
export type {
  EmailMessage,
  AuthEmailTemplates,
  RenderedEmail,
  VerifyEmailData,
  ResetPasswordData,
  InvitationData,
} from "./emails";
export { orgScope } from "./org-scope";
export type { OrgScope } from "./org-scope";
export * as authSchema from "./schema";
