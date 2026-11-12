"use client";

import { useState } from "react";
import { authClient } from "@/lib/client/auth-client";

export function SignOutButton({ className, everywhere = false, label }: { className?: string; everywhere?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className ?? "text-ink-soft underline-offset-4 hover:text-ink hover:underline"}
      onClick={async () => {
        setBusy(true);
        try {
          if (everywhere) await authClient().revokeSessions();
          await authClient().signOut();
        } finally {
          window.location.assign("/");
        }
      }}
    >
      {label ?? (everywhere ? "Sign out everywhere" : "Sign out")}
    </button>
  );
}
