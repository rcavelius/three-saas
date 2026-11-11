import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Log in", robots: { index: false }, alternates: { canonical: "/login" } };

export default function LoginPage() {
  return (
    <AuthShell eyebrow="Account" title="Log in to HookPilot">
      <LoginForm />
    </AuthShell>
  );
}
