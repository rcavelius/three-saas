"use client";

import { useState } from "react";
import { authClient } from "@/lib/client/auth-client";
import { Field, Notice, secondaryButton } from "@/components/ui";

export function ResendVerification({ next }: { next: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  return state === "sent" ? (
    <Notice tone="ok" role="status">
      If an unconfirmed account exists for that address, a new link is on its way.
    </Notice>
  ) : (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
        if (!email) return;
        setState("busy");
        await authClient().sendVerificationEmail({ email, callbackURL: `/verify-email?verified=1&next=${encodeURIComponent(next)}` });
        setState("sent");
      }}
    >
      <Field id="resend-email" name="email" type="email" label="Send a new link to" autoComplete="email" required />
      <button type="submit" className={secondaryButton} disabled={state === "busy"}>
        Send a new link
      </button>
    </form>
  );
}
