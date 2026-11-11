import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell eyebrow="Account" title="Reset your password" intro="We email you a link to choose a new password.">
      <ForgotForm />
    </AuthShell>
  );
}
