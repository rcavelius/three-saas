import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlan, CHANGEKITE_CATALOG } from "@repo/billing";
import { SignupForm } from "@/components/auth/SignupForm";
import { PageTitle } from "@/components/ui";
import { safePlan } from "@/lib/safe-next";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a ChangeKite account to monitor your websites, get alerts when something breaks and keep report history.",
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const plan = safePlan(sp.plan);
  if (await getViewer()) redirect(plan ? `/account/billing?plan=${plan}` : "/dashboard");
  const planDef = plan ? getPlan(CHANGEKITE_CATALOG, plan) : null;
  return (
    <div className="mx-auto max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <PageTitle
        eyebrow="Account"
        title="Create your account"
        lede={
          planDef
            ? `You chose ${planDef.name} ($${planDef.priceMonthlyCents / 100}/month). Confirm your email first; checkout follows.`
            : "Free to create. Monitoring starts with the Solo plan; one-off scans stay free without an account."
        }
      />
      <div className="mt-8">
        <SignupForm plan={plan} />
      </div>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link className="text-accent underline" href={plan ? `/login?next=${encodeURIComponent(`/account/billing?plan=${plan}`)}` : "/login"}>
          Log in
        </Link>
        . By creating an account you agree to the <Link className="text-accent underline" href="/terms">terms</Link> and the{" "}
        <Link className="text-accent underline" href="/privacy">privacy notice</Link>.
      </p>
    </div>
  );
}
