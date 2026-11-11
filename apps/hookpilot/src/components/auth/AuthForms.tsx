"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { track } from "@/lib/track";

const PLAN_RE = /^[a-z][a-z0-9_-]{0,39}$/;

/** Only same-site relative paths are accepted as post-login targets (no open redirect). */
export function safeNext(v: string | null): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/app";
  return v;
}

function Field(props: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; minLength?: number; hint?: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={props.id} className="text-[13px] text-fg-muted">
        {props.label}
      </label>
      <input
        id={props.id}
        name={props.id}
        type={props.type ?? "text"}
        required
        minLength={props.minLength}
        autoComplete={props.autoComplete}
        className="field h-10 text-[14px]"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
      />
      {props.hint && (
        <p id={`${props.id}-hint`} className="text-[12px] text-fg-dim">
          {props.hint}
        </p>
      )}
    </div>
  );
}

function ErrorText({ text }: { text: string | null }) {
  return (
    <p role="alert" aria-live="assertive" className="text-[13px] text-err min-h-[1.25rem]">
      {text}
    </p>
  );
}

export function SignupForm() {
  const params = useSearchParams();
  const plan = params.get("plan");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <div role="status" className="grid gap-3">
        <h2 className="text-[18px] font-semibold">Check your inbox</h2>
        <p className="text-[14px] text-fg-muted">
          We sent a confirmation link to <span className="font-mono text-fg">{email}</span>. It works for one hour. After confirming you are
          signed in{plan ? " and can continue to checkout" : ""}.
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        track("signup_started", plan && PLAN_RE.test(plan) ? { plan } : undefined);
        const q = new URLSearchParams({ verified: "1" });
        if (plan && PLAN_RE.test(plan)) q.set("plan", plan);
        const { error: err } = await authClient().signUp.email({ name, email, password, callbackURL: `/verify-email?${q}` });
        setBusy(false);
        if (err) setError(authErrorMessage(err, "Could not create the account."));
        else setSent(true);
      }}
    >
      <Field id="name" label="Name" value={name} onChange={setName} autoComplete="name" />
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={10}
        hint="At least 10 characters."
      />
      <ErrorText text={error} />
      <button className="btn btn-signal h-10 justify-center" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-[13px] text-fg-muted">
        Already have an account?{" "}
        <Link className="text-signal underline underline-offset-2" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const { error: err } = await authClient().signIn.email({ email, password });
        setBusy(false);
        if (err) return setError(authErrorMessage(err, "Wrong email or password."));
        router.push(safeNext(params.get("next")));
        router.refresh();
      }}
    >
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <ErrorText text={error} />
      <button className="btn btn-signal h-10 justify-center" disabled={busy}>
        {busy ? "Signing in…" : "Log in"}
      </button>
      <p className="text-[13px] text-fg-muted flex flex-wrap gap-x-4 gap-y-1">
        <Link className="text-signal underline underline-offset-2" href="/forgot-password">
          Forgot your password?
        </Link>
        <Link className="text-signal underline underline-offset-2" href="/signup">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <p role="status" className="text-[14px] text-fg-muted">
        If an account exists for <span className="font-mono text-fg">{email}</span>, a reset link is on its way. It works for one hour.
      </p>
    );
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const { error: err } = await authClient().requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (err && err.status === 429) setError(authErrorMessage(err, ""));
        else setDone(true); // same answer whether or not the account exists
      }}
    >
      <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <ErrorText text={error} />
      <button className="btn btn-signal h-10 justify-center">Send reset link</button>
    </form>
  );
}

export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error") ? "This reset link is invalid or has expired." : null);
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <p role="status" className="text-[14px] text-fg-muted">
        Password changed and other sessions signed out.{" "}
        <Link className="text-signal underline underline-offset-2" href="/login">
          Log in
        </Link>
      </p>
    );
  }
  if (!token) return <ErrorText text={error ?? "Open the link from the reset email."} />;
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const { error: err } = await authClient().resetPassword({ newPassword: password, token });
        if (err) setError(authErrorMessage(err, "Could not reset the password."));
        else setDone(true);
      }}
    >
      <Field
        id="password"
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={10}
        hint="At least 10 characters."
      />
      <ErrorText text={error} />
      <button className="btn btn-signal h-10 justify-center">Set new password</button>
    </form>
  );
}

/** After the verification link: success/failure, then optionally continue to checkout for ?plan=. */
export function VerifyResult() {
  const params = useSearchParams();
  const error = params.get("error");
  const plan = params.get("plan");
  const verified = params.get("verified") === "1" && !error;
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (verified) track("signup_completed");
  }, [verified]);

  async function checkout(planId: string) {
    setCheckoutMsg("Opening checkout…");
    track("checkout_started", { plan: planId });
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
      credentials: "same-origin",
    });
    const j = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } | string; message?: string };
    if (res.ok && j.url) {
      window.location.assign(j.url);
      return;
    }
    const m = typeof j.error === "object" ? j.error?.message : j.message;
    setCheckoutMsg(m ?? `Checkout is not available right now (${res.status}). Your account is on the Free plan.`);
  }

  useEffect(() => {
    if (verified && plan && PLAN_RE.test(plan) && plan !== "free" && !started.current) {
      started.current = true;
      void checkout(plan);
    }
  }, [verified, plan]);

  if (error) {
    return (
      <div role="alert" className="grid gap-3">
        <h2 className="text-[18px] font-semibold">This link did not work</h2>
        <p className="text-[14px] text-fg-muted">
          Confirmation links expire after one hour and work once. Log in to get a new one, or sign up again.
        </p>
        <Link className="btn w-fit" href="/login">
          Log in
        </Link>
      </div>
    );
  }
  if (!verified) {
    return (
      <div className="grid gap-3">
        <h2 className="text-[18px] font-semibold">Confirm your email</h2>
        <p className="text-[14px] text-fg-muted">Open the link we emailed you. It works for one hour.</p>
      </div>
    );
  }
  return (
    <div role="status" className="grid gap-3">
      <h2 className="text-[18px] font-semibold">Email confirmed, you are signed in</h2>
      {checkoutMsg && <p className="text-[14px] text-fg-muted">{checkoutMsg}</p>}
      <p className="text-[14px] text-fg-muted">
        Endpoints you created anonymously in this browser can be claimed into your workspace from the dashboard.
      </p>
      <Link className="btn btn-signal w-fit" href="/app">
        Go to dashboard
      </Link>
    </div>
  );
}

export function AcceptInvitation({ id }: { id: string }) {
  const router = useRouter();
  const session = authClient().useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (session.isPending) return <p className="font-mono text-[12px] text-fg-dim">Loading…</p>;
  if (!session.data) {
    const next = encodeURIComponent(`/accept-invitation/${id}`);
    return (
      <div className="grid gap-3">
        <p className="text-[14px] text-fg-muted">Log in (or create an account with the invited email address) to accept this invitation.</p>
        <div className="flex gap-2">
          <Link className="btn btn-signal" href={`/login?next=${next}`}>
            Log in
          </Link>
          <Link className="btn" href="/signup">
            Create account
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="text-[14px] text-fg-muted">
        Signed in as <span className="font-mono text-fg">{session.data.user.email}</span>. Accepting adds you to the workspace; its members see its
        endpoints and captured requests.
      </p>
      <ErrorText text={error} />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-signal"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await authClient().organization.acceptInvitation({ invitationId: id });
            if (r.error) {
              setBusy(false);
              return setError(authErrorMessage(r.error, "Could not accept the invitation."));
            }
            const orgId = (r.data as { invitation?: { organizationId?: string } } | null)?.invitation?.organizationId;
            if (orgId) await authClient().organization.setActive({ organizationId: orgId });
            router.push("/app");
            router.refresh();
          }}
        >
          Accept invitation
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            await authClient().organization.rejectInvitation({ invitationId: id });
            router.push("/");
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export function SignOutButton({ className = "btn btn-ghost h-7" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await authClient().signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
