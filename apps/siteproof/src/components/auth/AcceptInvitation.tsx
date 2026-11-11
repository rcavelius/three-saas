"use client";

import { useState } from "react";
import { authClient, errorMessage } from "@/lib/client/auth-client";
import { Notice, primaryButton, secondaryButton } from "@/components/ui";

export function AcceptInvitation({ invitationId, organizationId }: { invitationId: string; organizationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  if (declined) return <Notice tone="info" role="status">Invitation declined.</Notice>;
  return (
    <div className="space-y-4">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const { error: err } = await authClient().organization.acceptInvitation({ invitationId });
            if (err) {
              setBusy(false);
              setError(errorMessage(err, "This invitation could not be accepted. It may have expired, or the workspace has no free seats."));
              return;
            }
            await authClient().organization.setActive({ organizationId });
            window.location.assign("/dashboard");
          }}
        >
          Join the workspace
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await authClient().organization.rejectInvitation({ invitationId });
            setDeclined(true);
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
