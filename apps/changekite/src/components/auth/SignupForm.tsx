"use client";

import { useEffect, useState } from "react";
import { authClient, errorMessage } from "@/lib/client/auth-client";
import { track } from "@/lib/client/track";
import { Field, Notice, primaryButton } from "@/components/ui";

export function SignupForm({ plan }: { plan: "solo" | "agency" | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    track("signup_started", plan ? { plan } : undefined);
  }, [plan]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const name = String(f.get("name") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    setBusy(true);
    setError(null);
    const next = plan ? `/account/billing?plan=${plan}` : "/dashboard";
    const { error: err } = await authClient().signUp.email({
      email,
      password,
      name: name || email.split("@")[0]!,
      callbackURL: `/verify-email?verified=1&next=${encodeURIComponent(next)}`,
    });
    setBusy(false);
    if (err) {
      setError(errorMessage(err, "Sign-up failed. Please check the details and try again."));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Notice tone="ok" role="status">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-ink-soft">
          We sent a confirmation link to <span className="num">{sentTo}</span>. Open it within an hour to finish creating your account
          {plan ? " and continue to checkout" : ""}.
        </p>
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field id="name" name="name" label="Your name" autoComplete="name" maxLength={60} />
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required maxLength={254} />
      <Field id="password" name="password" type="password" label="Password" autoComplete="new-password" required minLength={10} maxLength={128} hint="At least 10 characters." />
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
