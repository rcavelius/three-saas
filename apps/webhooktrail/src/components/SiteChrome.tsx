import Link from "next/link";
import { SignOutButton } from "./auth/AuthForms";
import { NavLinks } from "./grid/NavLinks";
import { PixelTitle } from "./grid/PixelTitle";
import { legalInfo } from "@/lib/legal";

/** The signal mark: a flat line with one recorded event. Monoline, works at 16px. */
export function SignalMark({ className = "h-[15px] w-[26px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 16" aria-hidden="true" className={className} fill="none">
      <path d="M1 9h7l2.5-6 4 11 3-8 1.5 3H27" stroke="var(--color-signal)" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <SignalMark />
      <span className="font-[family-name:var(--font-pixel)] text-[16px] font-bold uppercase leading-none tracking-[0.02em]">WebhookTrail</span>
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

const cell = "flex items-stretch border-l border-line";

export function SiteHeader({ signedIn, operator }: { signedIn: boolean; operator?: boolean }) {
  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-bg">
      <div className="g-frame flex h-14 items-stretch md:h-16">
        <Link href="/" aria-label="WebhookTrail home" className="flex items-center px-4 md:px-5">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className={`${cell} hidden md:flex`}>
          <NavLinks items={NAV} />
        </nav>
        <div className="hidden flex-1 border-l border-line md:block" aria-hidden="true" />
        <div className="hidden items-stretch md:flex">
          {signedIn ? (
            <>
              {operator && (
                <Link className="g-nav border-l border-line" href="/admin">
                  Ops
                </Link>
              )}
              <Link className="g-nav border-l border-line" href="/account">
                Account
              </Link>
              <SignOutButton className="g-nav cursor-pointer border-l border-line" />
              <span className="flex items-center border-l border-line px-3">
                <Link className="btn-cut btn-cut-sm" href="/app">
                  Dashboard <span aria-hidden="true" className="arr">→</span>
                </Link>
              </span>
            </>
          ) : (
            <>
              <Link className="g-nav border-l border-line" href="/login">
                Log in
              </Link>
              <span className="flex items-center border-l border-line px-3">
                <Link className="btn-cut btn-cut-sm" href="/#create">
                  Create endpoint <span aria-hidden="true" className="arr">→</span>
                </Link>
              </span>
            </>
          )}
        </div>

        {/* Phone: one Menu control (a disclosure, works without JavaScript). */}
        <details className="group relative ml-auto flex border-l border-line md:hidden">
          <summary aria-label="Menu" className="g-cap flex h-full cursor-pointer list-none items-center gap-2 px-4 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
            <span aria-hidden="true" className="grid h-[14px] w-[14px] place-items-center">
              <span className="block h-[2px] w-[14px] bg-fg shadow-[0_5px_0_var(--color-fg),0_-5px_0_var(--color-fg)] group-open:shadow-none" />
            </span>
          </summary>
          <div className="absolute right-[-1px] top-[calc(100%+1px)] w-[min(20rem,calc(100vw-2rem))] border border-line bg-bg shadow-[0_24px_48px_-16px_rgba(0,0,0,0.35)]">
            <ul>
              {NAV.map(([href, label]) => (
                <li key={href} className="border-b border-line">
                  <Link className="g-cap g-link flex min-h-12 items-center justify-between px-4 !text-[13px]" href={href}>
                    {label}
                    <span aria-hidden="true" className="arr">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 p-3">
              {signedIn ? (
                <>
                  <Link className="btn-cut w-full" href="/app">
                    Dashboard
                  </Link>
                  <Link className="btn-cut btn-cut-ghost w-full" href="/account">
                    Account
                  </Link>
                  <SignOutButton className="btn-cut btn-cut-ghost w-full" />
                </>
              ) : (
                <>
                  <Link className="btn-cut w-full" href="/#create">
                    Create endpoint
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <Link className="btn-cut btn-cut-ghost" href="/login">
                      Log in
                    </Link>
                    <Link className="btn-cut btn-cut-ghost" href="/signup">
                      Sign up
                    </Link>
                  </div>
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
  const entity = legalInfo().entity;
  return (
    <footer className="border-t border-line">
      <div className="g-frame">
        <ul className="g-row grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          {FOOT.map(([href, label], i) => (
            <li key={href} className={i % 2 === 0 ? "g-x" : ""}>
              <Link className="g-cap g-link flex min-h-12 items-center justify-between px-4" href={href}>
                {label}
                <span aria-hidden="true" className="arr text-fg-faint">→</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="g-fit px-4 pb-4 pt-8 md:px-5 md:pt-10" aria-hidden="true">
          <PixelTitle as="p" text="WebhookTrail" lines={["WebhookTrail"]} phoneEm={20} max={400} maxPhone={400} className="text-fg" />
        </div>
        <p className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-4 font-mono text-[12px] text-fg-dim md:px-5">
          <span>Webhook capture, inspection and replay.</span>
          <span>© {new Date().getFullYear()} {entity ?? "WebhookTrail"}</span>
        </p>
      </div>
    </footer>
  );
}
