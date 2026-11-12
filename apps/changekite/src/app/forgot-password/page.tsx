import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/PasswordForms";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle eyebrow="Account" title="Forgot your password?" lede="Enter your email and we will send a link to choose a new one." />
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
