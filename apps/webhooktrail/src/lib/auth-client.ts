"use client";

import { createAppAuthClient, type AppAuthClient } from "@repo/auth/client";

let client: AppAuthClient | null = null;

/** Same-origin Better Auth client (httpOnly session cookie; the browser never sees the token). */
export function authClient(): AppAuthClient {
  client ??= createAppAuthClient(window.location.origin);
  return client;
}

/** Human message for a Better Auth client error. */
export function authErrorMessage(err: { message?: string; status?: number; code?: string } | null | undefined, fallback: string): string {
  if (!err) return fallback;
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (err.code === "EMAIL_NOT_VERIFIED") return "Confirm your email first: we sent you a link when you signed up.";
  return err.message || fallback;
}
