import type { Metadata } from "next";
import { VerifyEmail } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

type SP = { status?: string; error?: string; email?: string; plan?: string };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = (v: unknown) => (typeof v === "string" ? v : undefined);
  return <VerifyEmail status={s(sp.status)} error={s(sp.error)} email={s(sp.email)} plan={s(sp.plan)} />;
}
