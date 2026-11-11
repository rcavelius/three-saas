import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Create an account", description: "Create a DataPolish account to save workflows and choose a plan.", alternates: { canonical: "/signup" } };

export default async function Signup({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return <SignupForm plan={typeof plan === "string" ? plan : undefined} />;
}
