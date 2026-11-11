import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { AcceptInvitation } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Workspace invitation", robots: { index: false } };

export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AuthShell eyebrow="Team" title="You were invited to a HookPilot workspace">
      <AcceptInvitation id={id} />
    </AuthShell>
  );
}
