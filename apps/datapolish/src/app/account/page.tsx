import type { Metadata } from "next";
import { AccountTabs } from "@/components/account/AccountNavTabs";
import { AccountPanels } from "@/components/account/AccountPanels";
import { requirePageSession } from "@/server/session";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const { session } = await requirePageSession("/account");
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Account</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your account</h1>
      <AccountTabs current="/account" />
      <AccountPanels user={{ name: session.user.name, email: session.user.email }} currentSessionId={session.session.id} />
    </div>
  );
}
