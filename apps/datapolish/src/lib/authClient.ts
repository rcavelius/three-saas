"use client";

import { createAppAuthClient, type AppAuthClient } from "@repo/auth/client";

let client: AppAuthClient | null = null;

/** Better Auth browser client on our own origin (same-origin requests carry the httpOnly cookie). */
export function authClient(): AppAuthClient {
  client ??= createAppAuthClient(typeof window !== "undefined" ? window.location.origin : "http://localhost");
  return client;
}

/** Turns a Better Auth client error into one readable sentence. */
export function authErrorMessage(err: { message?: string; status?: number; code?: string } | null | undefined, fallback = "Something went wrong. Try again."): string {
  if (!err) return fallback;
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  return err.message || fallback;
}
