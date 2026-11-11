import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accounts are coming", robots: { index: false } };

export default async function Signup({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const name = plan === "business" ? "Business" : plan === "pro" ? "Pro" : null;
  return (
    <div className="mx-auto max-w-[640px] px-4 py-14 sm:px-6">
      <p className="eyebrow">Accounts</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Accounts are coming</h1>
      <p className="mt-4 text-ink-2">
        {name ? `The ${name} plan is not on sale yet. ` : ""}DataPolish accounts, synced workflows and paid plans are still being built. There is no checkout and nothing to
        pay for today.
      </p>
      <p className="mt-3 text-ink-2">
        Everything in the free plan works now without an account. Your saved workflows stay in this browser, and you can export them as JSON files to keep or share.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">
          Open the cleaner
        </Link>
        <Link href="/pricing" className="btn">
          Back to pricing
        </Link>
      </div>
    </div>
  );
}
