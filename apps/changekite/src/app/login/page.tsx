import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { PageTitle } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Log in", alternates: { canonical: "/login" }, robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  return (
    <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle eyebrow="Account" title="Log in" />
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-sm text-muted">
        New to ChangeKite?{" "}
        <Link className="text-accent underline" href="/signup">
          Create an account
        </Link>
        .
      </p>
    </div>
  );
}
