"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient, errorMessage } from "@/lib/client/auth-client";
import { Field, Notice, primaryButton } from "@/components/ui";

export function ForgotPasswordForm() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "sent") {
    return (
      <Notice tone="ok" role="status">
        If an account exists for that address, we sent a link to choose a new password. It expires in one hour.
      </Notice>
    );
  }
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
        if (!email) return;
        setState("busy");
        setError(null);
        const { error: err } = await authClient().requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (err && err.status === 429) {
          setError(errorMessage(err, ""));
          setState("idle");
          return;
        }
        setState("sent");
      }}
    >
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <button type="submit" className={primaryButton} disabled={state === "busy"}>
        Send reset link
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <Notice tone="ok" role="status">
        Your password was changed and you were signed out everywhere.{" "}
        <Link href="/login" className="text-accent underline">
          Log in with the new password
        </Link>
        .
      </Notice>
    );
  }
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const pw = String(f.get("password") ?? "");
        if (pw.length < 10) return setError("Use at least 10 characters.");
        if (pw !== String(f.get("confirm") ?? "")) return setError("The two passwords do not match.");
        setState("busy");
        setError(null);
        const { error: err } = await authClient().resetPassword({ newPassword: pw, token });
        if (err) {
          setState("idle");
          setError(errorMessage(err, "The link is invalid or has expired. Request a new one."));
          return;
        }
        setState("done");
      }}
    >
      <Field id="password" name="password" type="password" label="New password" autoComplete="new-password" required minLength={10} maxLength={128} hint="At least 10 characters." />
      <Field id="confirm" name="confirm" type="password" label="Repeat the new password" autoComplete="new-password" required maxLength={128} />
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <button type="submit" className={primaryButton} disabled={state === "busy"}>
        Save new password
      </button>
    </form>
  );
}
