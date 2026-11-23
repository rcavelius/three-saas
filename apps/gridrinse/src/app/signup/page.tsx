import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = pageMeta({ title: "Create an account", description: "Create a free GridRinse account to save cleaning workflows and choose a plan. The cleaner itself works without an account.", path: "/signup" });

export default async function Signup({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignupForm plan={typeof plan === "string" ? plan : undefined} />;
}
