/**
 * Browser client for the auth routes mounted at /api/auth. Same-origin requests carry the httpOnly
 * session cookie automatically; the client never sees the token.
 *
 *   export const authClient = createAppAuthClient(process.env.NEXT_PUBLIC_APP_URL!);
 *   authClient.signUp.email({ email, password, name, callbackURL: "/app" });
 *   authClient.organization.inviteMember({ email, role: "member" });
 */
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export function createAppAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    basePath: "/api/auth",
    plugins: [organizationClient()],
  });
}

export type AppAuthClient = ReturnType<typeof createAppAuthClient>;
