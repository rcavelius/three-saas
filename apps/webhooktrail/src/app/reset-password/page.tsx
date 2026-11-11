import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Account" title="Choose a new password" intro="Changing your password signs out your other sessions.">
      <ResetForm />
    </AuthShell>
  );
}
