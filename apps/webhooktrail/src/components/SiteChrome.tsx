import Link from "next/link";
import { SignOutButton } from "./auth/AuthForms";

/** The signal mark: a flat line with one recorded event. Monoline, works at 16px. */
export function SignalMark({ className = "h-[15px] w-[26px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 16" aria-hidden="true" className={className} fill="none">
      <path d="M1 9h7l2.5-6 4 11 3-8 1.5 3H27" stroke="var(--color-signal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.025em]">
      <SignalMark />
      WebhookTrail
    </span>
  );
}

const NAV: [string, string][] = [
  ["/docs", "Docs"],
  ["/pricing", "Pricing"],
  ["/tools", "Tools"],
  ["/guides", "Guides"],
  ["/help", "Help"],
];

const navLink = "rounded-md px-3 py-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg";

export function SiteHeader({ signedIn, operator }: { signedIn: boolean; operator?: boolean }) {
  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-5 md:h-[72px] md:px-8 lg:px-12">
        <Link href="/" aria-label="WebhookTrail home" className="rounded-sm">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-0.5 text-[14px] font-medium md:flex">
          {NAV.map(([href, label]) => (
            <Link key={href} className={navLink} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-1 text-[14px] font-medium md:flex">
          {signedIn ? (
            <>
              {operator && (
                <Link className={navLink} href="/admin">
                  Ops
                </Link>
              )}
              <Link className={navLink} href="/account">
                Account
              </Link>
              <SignOutButton className={navLink} />
              <Link className="btn btn-signal ml-2 h-11 rounded-[10px] px-5 text-[14px]" href="/app">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link className={navLink} href="/login">
                Log in
              </Link>
              <Link className="btn btn-signal ml-2 h-11 rounded-[10px] px-5 text-[14px]" href="/#create">
                Create endpoint <span aria-hidden="true" className="font-mono">→</span>
              </Link>
            </>
          )}
        </div>

        {/* Phone: one Menu control (a disclosure, works without JavaScript). */}
        <details className="group relative ml-auto md:hidden">
          <summary aria-label="Menu" className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-[10px] border border-line-strong [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 group-open:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h14M3 10h14M3 14h14" />
            </svg>
            <svg viewBox="0 0 20 20" aria-hidden="true" className="hidden h-5 w-5 group-open:block" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </summary>
          <div className="absolute right-0 top-[calc(100%+8px)] w-[min(18rem,calc(100vw-2.5rem))] rounded-[14px] border border-line-strong bg-surface p-2 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
            <ul>
              {NAV.map(([href, label]) => (
                <li key={href}>
                  <Link className="block rounded-lg px-3 py-3 text-[16px] font-semibold hover:bg-surface-2" href={href}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid gap-2 border-t border-line p-2 pt-3">
              {signedIn ? (
                <>
                  <Link className="btn btn-signal h-11 justify-center text-[15px]" href="/app">
                    Dashboard
                  </Link>
                  <Link className="btn h-11 justify-center text-[15px]" href="/account">
                    Account
                  </Link>
                  <SignOutButton className="btn h-11 justify-center text-[15px]" />
                </>
              ) : (
                <>
                  <Link className="btn h-11 justify-center text-[15px]" href="/login">
                    Log in
                  </Link>
                  <Link className="btn h-11 justify-center text-[15px]" href="/signup">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

const FOOT: [string, string][] = [
  ["/docs", "Docs"],
  ["/tools", "Tools"],
  ["/guides", "Guides"],
  ["/pricing", "Pricing"],
  ["/help", "Help center"],
  ["/support", "Contact support"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line text-[13px] text-fg-dim">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:px-8 lg:px-12">
        <Wordmark />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 md:ml-auto">
          {FOOT.map(([href, label]) => (
            <Link key={href} className="hover:text-fg" href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
