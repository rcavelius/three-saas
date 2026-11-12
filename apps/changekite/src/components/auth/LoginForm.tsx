"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient, errorMessage } from "@/lib/client/auth-client";
import { Field, Notice, primaryButton, secondaryButton } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    setBusy(true);
    setError(null);
    setUnverified(null);
    const { error: err } = await authClient().signIn.email({ email, password });
    if (err) {
      setBusy(false);
      if (err.status === 403) {
        setUnverified(email);
        return;
      }
      setError(err.status === 401 ? "That email and password do not match." : errorMessage(err, "Could not sign in. Please try again."));
      return;
    }
    window.location.assign(next);
  }

  async function resend() {
    if (!unverified) return;
    await authClient().sendVerificationEmail({ email: unverified, callbackURL: `/verify-email?verified=1&next=${encodeURIComponent(next)}` });
    setResent(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required maxLength={254} />
      <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" required maxLength={128} />
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {unverified && (
        <Notice tone="warn" role="alert">
          <p>Please confirm your email address first. The link is in the email we sent when you signed up.</p>
          <p className="mt-2">
            {resent ? (
              "A new link is on its way."
            ) : (
              <button type="button" className={secondaryButton} onClick={resend}>
                Send a new link
              </button>
            )}
          </p>
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Signing in…" : "Log in"}
        </button>
        <Link href="/forgot-password" className="text-sm text-accent underline">
          Forgot your password?
        </Link>
      </div>
    </form>
  );
}
