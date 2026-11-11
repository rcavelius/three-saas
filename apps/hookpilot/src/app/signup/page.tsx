import type { Metadata } from "next";
import Link from "next/link";
import { CreateEndpointButton } from "@/components/CreateEndpointButton";

export const metadata: Metadata = { title: "Accounts are coming", robots: { index: false } };

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16">
      <p className="label">Accounts</p>
      <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em]">Accounts and paid plans are not available yet.</h1>
      <p className="mt-4 text-[15px] text-fg-muted leading-relaxed">
        HookPilot currently runs without sign-up: free endpoints belong to the browser that created them and expire after 24 hours
        (extendable up to 7 days). Developer and Pro plans will arrive together with accounts. There is no checkout and no waiting list
        form on this page, so nothing is collected here.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <CreateEndpointButton size="sm" />
        <Link href="/pricing" className="btn">
          Back to pricing
        </Link>
      </div>
    </div>
  );
}
