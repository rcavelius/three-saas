import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}
