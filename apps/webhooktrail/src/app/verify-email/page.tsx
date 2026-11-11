import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyResult } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <AuthShell eyebrow="Account" title="Email confirmation">
      <VerifyResult />
    </AuthShell>
  );
}
