"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { startCheckout } from "@/components/PlanButton";
import { track } from "@/lib/analytics";
import { authClient, authErrorMessage } from "@/lib/authClient";

const PAID = new Set(["pro", "business"]);

/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeNext(next: string | undefined | null, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

function Field({ label, type = "text", value, onChange, autoComplete, hint, minLength, required = true }: { label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; hint?: string; minLength?: number; required?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className="field"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[12px] text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[460px] px-4 py-12 sm:px-6">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ErrorText({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p role="alert" className="border-l-2 border-del-ink bg-del px-3 py-2 text-sm text-del-ink">
      {msg}
    </p>
  );
}

export function SignupForm({ plan }: { plan?: string }) {
  const paid = plan && PAID.has(plan) ? plan : undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    track("signup_started", { plan: (paid ?? "free") as "free" });
  }, [paid]);

  if (sent) {
    return (
      <Shell eyebrow="Almost done" title="Check your email">
        <p className="text-ink-2">
          We sent a confirmation link to <strong>{email}</strong>. Open it to activate your account{paid ? " and continue to checkout" : ""}. The link expires in 1 hour.
        </p>
        <p className="mt-4 text-sm text-ink-3">
          No email? Check spam, or <Link href={`/verify-email?email=${encodeURIComponent(email)}${paid ? `&plan=${paid}` : ""}`} className="text-accent underline">send it again</Link>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell eyebrow={paid ? `Sign up for ${paid === "pro" ? "Pro" : "Business"}` : "Create an account"} title="Create your DataPolish account">
      <p className="mb-5 text-sm text-ink-2">
        An account keeps your workflows and plan. Your spreadsheets are still processed only in your browser and are never uploaded. The cleaner itself works without an account.
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setBusy(true);
          const callbackURL = `/verify-email?status=verified${paid ? `&plan=${paid}` : ""}`;
          const { error } = await authClient().signUp.email({ name: name.trim() || email.split("@")[0]!, email: email.trim(), password, callbackURL });
          setBusy(false);
          if (error) setErr(authErrorMessage(error));
          else setSent(true);
        }}
      >
        <Field label="Name" value={name} onChange={setName} autoComplete="name" required={false} />
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={10} hint="At least 10 characters." />
        <ErrorText msg={err} />
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline">
          Log in
        </Link>
      </p>
    </Shell>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Shell eyebrow="Welcome back" title="Log in to DataPolish">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          setUnverified(false);
          setBusy(true);
          const { error } = await authClient().signIn.email({ email: email.trim(), password });
          setBusy(false);
          if (error) {
            if (error.status === 403) {
              setUnverified(true);
              setErr("Confirm your email address first. We can send the link again.");
            } else setErr(error.status === 401 ? "Email or password is incorrect." : authErrorMessage(error));
            return;
          }
          window.location.assign(safeNext(next, "/"));
        }}
      >
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <ErrorText msg={err} />
        {unverified && (
          <p className="text-sm">
            <Link href={`/verify-email?email=${encodeURIComponent(email)}`} className="text-accent underline">
              Send the confirmation email again
            </Link>
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-5 flex flex-wrap justify-between gap-2 text-sm text-ink-2">
        <Link href="/forgot-password" className="text-accent underline">
          Forgot your password?
        </Link>
        <Link href="/signup" className="text-accent underline">
          Create an account
        </Link>
      </p>
    </Shell>
  );
}

export function VerifyEmail({ status, error, email: initialEmail, plan }: { status?: string; error?: string; email?: string; plan?: string }) {
  const paid = plan && PAID.has(plan) ? plan : undefined;
  const [email, setEmail] = useState(initialEmail ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [checkoutErr, setCheckoutErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verified = status === "verified" && !error;

  useEffect(() => {
    if (verified) track("signup_completed");
  }, [verified]);

  if (verified) {
    return (
      <Shell eyebrow="Account ready" title="Your email is confirmed">
        <p className="text-ink-2">You are signed in. Your workspace is on the free plan.</p>
        {paid ? (
          <div className="mt-5">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setCheckoutErr(await startCheckout(paid));
                setBusy(false);
              }}
            >
              Continue to checkout for {paid === "pro" ? "Pro" : "Business"}
            </button>
            {checkoutErr && (
              <p role="alert" className="mt-3 text-sm text-del-ink">
                {checkoutErr}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-5">
            <Link href="/" className="btn btn-primary">
              Open the cleaner
            </Link>
          </p>
        )}
      </Shell>
    );
  }

  return (
    <Shell eyebrow="Confirm your email" title={error ? "That link did not work" : "Check your inbox"}>
      <p className="text-ink-2">
        {error
          ? "The confirmation link is invalid or has expired (links last 1 hour). Enter your email to get a new one."
          : "We sent you a confirmation link. Open it to activate your account. You can request a new link below."}
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error: err } = await authClient().sendVerificationEmail({ email: email.trim(), callbackURL: `/verify-email?status=verified${paid ? `&plan=${paid}` : ""}` });
          setBusy(false);
          setMsg(err ? authErrorMessage(err) : "If that address has an unconfirmed account, a new link is on its way.");
        }}
      >
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <button type="submit" className="btn" disabled={busy}>
          Send a new link
        </button>
        {msg && (
          <p className="text-sm text-ink-2" aria-live="polite">
            {msg}
          </p>
        )}
      </form>
    </Shell>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell eyebrow="Password" title="Reset your password">
      {done ? (
        <p className="text-ink-2">If an account exists for {email}, we sent a link to choose a new password. It expires in 1 hour.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            const { error } = await authClient().requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
            if (error && error.status === 429) setErr(authErrorMessage(error));
            else setDone(true);
          }}
        >
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <ErrorText msg={err} />
          <button type="submit" className="btn btn-primary">
            Send reset link
          </button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPasswordForm({ token, error }: { token?: string; error?: string }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(error ? "This reset link is invalid or has expired. Ask for a new one." : null);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <Shell eyebrow="Password" title="Password changed">
        <p className="text-ink-2">You were signed out on all devices. Log in with your new password.</p>
        <p className="mt-5">
          <Link href="/login" className="btn btn-primary">
            Log in
          </Link>
        </p>
      </Shell>
    );
  }
  return (
    <Shell eyebrow="Password" title="Choose a new password">
      {!token ? (
        <p className="text-ink-2">
          This page needs the link from your email. <Link href="/forgot-password" className="text-accent underline">Ask for a new link</Link>.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error: er } = await authClient().resetPassword({ newPassword: password, token });
            if (er) setErr(authErrorMessage(er, "This reset link is invalid or has expired."));
            else setDone(true);
          }}
        >
          <Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={10} hint="At least 10 characters." />
          <ErrorText msg={err} />
          <button type="submit" className="btn btn-primary">
            Save new password
          </button>
        </form>
      )}
    </Shell>
  );
}

export function AcceptInvitation({ id }: { id: string }) {
  const { data, isPending } = authClient().useSession();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const next = `/accept-invitation/${encodeURIComponent(id)}`;
  return (
    <Shell eyebrow="Team invitation" title="Join a DataPolish team">
      {isPending ? (
        <p className="text-ink-3">Checking your session…</p>
      ) : !data ? (
        <>
          <p className="text-ink-2">Log in (or create an account with the invited email address) to accept this invitation.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-primary">
              Log in
            </Link>
            <Link href="/signup" className="btn">
              Create an account
            </Link>
          </div>
        </>
      ) : state === "done" ? (
        <>
          <p className="text-ink-2">You joined the team. Its saved workflows are now available in the cleaner.</p>
          <p className="mt-5">
            <Link href="/" className="btn btn-primary">
              Open the cleaner
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-ink-2">Signed in as {data.user.email}.</p>
          <ErrorText msg={err} />
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={state === "busy"}
              onClick={async () => {
                setState("busy");
                const c = authClient();
                const { data: accepted, error } = await c.organization.acceptInvitation({ invitationId: id });
                if (error) {
                  setErr(authErrorMessage(error, "This invitation is invalid, expired, or for another email address."));
                  setState("idle");
                  return;
                }
                const orgId = (accepted as { member?: { organizationId?: string } } | null)?.member?.organizationId;
                if (orgId) await c.organization.setActive({ organizationId: orgId });
                setState("done");
              }}
            >
              Accept invitation
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await authClient().organization.rejectInvitation({ invitationId: id });
                setErr("Invitation declined.");
              }}
            >
              Decline
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}
