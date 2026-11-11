"use client";

import { createAppAuthClient, type AppAuthClient } from "@repo/auth/client";

let client: AppAuthClient | null = null;

/** Same-origin Better Auth client (httpOnly cookies; the browser never sees the session token). */
export function authClient(): AppAuthClient {
  client ??= createAppAuthClient(window.location.origin);
  return client;
}

/** Better Auth client results are { data, error }; this turns an error into a readable message. */
export function errorMessage(err: { message?: string; status?: number; code?: string } | null | undefined, fallback: string): string {
  if (!err) return fallback;
  if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
  return err.message && err.message.length < 200 ? err.message : fallback;
}
