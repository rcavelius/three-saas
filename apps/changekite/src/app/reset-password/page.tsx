import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/PasswordForms";
import { Notice, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(sp.token) ? sp.token : null;
  return (
    <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle eyebrow="Account" title="Choose a new password" />
      <div className="mt-8">
        {token && !sp.error ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Notice tone="error" role="alert">
            This reset link is invalid or has expired.{" "}
            <Link href="/forgot-password" className="text-accent underline">
              Request a new one
            </Link>
            .
          </Notice>
        )}
      </div>
    </div>
  );
}
