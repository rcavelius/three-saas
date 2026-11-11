import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a free HookPilot account: keep webhook endpoints in a workspace, invite your team and replay requests on paid plans.",
  alternates: { canonical: "/signup" },
};

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Account"
      title="Create your HookPilot account"
      intro="Free to start, no card. Your endpoints live in a workspace; anonymous endpoints from this browser can be claimed after you confirm your email."
    >
      <SignupForm />
    </AuthShell>
  );
}
