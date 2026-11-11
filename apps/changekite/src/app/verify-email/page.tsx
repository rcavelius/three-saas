import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle, Notice, primaryButton } from "@/components/ui";
import { TrackOnMount } from "@/components/Analytics";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { safeNext } from "@/lib/safe-next";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

/**
 * Landing page of the verification link (Better Auth redirects here with ?verified=1, or ?error=...).
 * Without parameters it explains the pending state.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const error = typeof sp.error === "string" ? sp.error : null;
  const viewer = await getViewer();

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
        <PageTitle eyebrow="Account" title="That link did not work" />
        <div className="mt-8 space-y-6">
          <Notice tone="error" role="alert">
            {error.toLowerCase().includes("expired") ? "The confirmation link has expired." : "The confirmation link is invalid or was already used."}{" "}
            Request a new one below.
          </Notice>
          <ResendVerification next={next} />
        </div>
      </div>
    );
  }

  if (sp.verified && viewer) {
    return (
      <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
        <TrackOnMount name="signup_completed" />
        <PageTitle eyebrow="Account" title="Email confirmed" lede="Your account is ready and you are signed in." />
        <p className="mt-8">
          <Link href={next} className={primaryButton}>
            Continue
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle
        eyebrow="Account"
        title="Confirm your email"
        lede="We sent you a link. Open it on this device within an hour to finish creating your account. Check spam if it has not arrived after a few minutes."
      />
      <div className="mt-8">
        <ResendVerification next={next} />
      </div>
    </div>
  );
}
