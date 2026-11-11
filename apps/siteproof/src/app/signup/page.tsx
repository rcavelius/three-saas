import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Accounts are coming", robots: { index: false } };

export default function SignupPage() {
  return (
    <DocPage eyebrow="Accounts" title="Accounts are coming soon" lede="Paid plans with monitoring, scheduled re-scans and alerts are being built. Sign-up is not open yet, and nothing is charged.">
      <p>
        In the meantime, free scans work fully without an account: <Link href="/">run an inspection</Link> and keep the
        report link.
      </p>
      <p>
        See <Link href="/pricing">pricing</Link> for what the Solo and Agency plans will include.
      </p>
    </DocPage>
  );
}
