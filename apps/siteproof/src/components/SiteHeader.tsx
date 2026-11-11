import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { SignOutButton } from "./SignOutButton";

const NAV = [
  { href: "/docs", label: "What we check" },
  { href: "/guides", label: "Guides" },
  { href: "/pricing", label: "Pricing" },
];

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="no-print border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-4 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-3 no-underline">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">SiteProof</span>
          <span className="eyebrow hidden sm:inline">Website inspection</span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[0.95rem]">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                  {n.label}
                </Link>
              </li>
            ))}
            {viewer ? (
              <>
                <li>
                  <Link href="/dashboard" className="font-medium text-accent underline-offset-4 hover:underline">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/account" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                    Account
                  </Link>
                </li>
                <li>
                  <SignOutButton />
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link href="/login" className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                    Log in
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="font-medium text-accent underline-offset-4 hover:underline">
                    Sign up
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
