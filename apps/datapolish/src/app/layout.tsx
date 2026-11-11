import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { AccountNav, PageviewTracker } from "@/components/SiteChrome";
import { appUrl } from "@/lib/site";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(appUrl()),
    title: { default: "DataPolish — clean CSV and Excel files in your browser", template: "%s · DataPolish" },
    description:
      "Trim spaces, remove blank and duplicate rows, fix dates and numbers, merge files. Runs entirely in your browser; your files are never uploaded.",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "DataPolish",
      title: "DataPolish — clean CSV and Excel files in your browser",
      description: "Clean messy spreadsheets in your browser. Files are never uploaded.",
      url: "/",
    },
  };
}

export const viewport: Viewport = { themeColor: "#f5f7f9", width: "device-width", initialScale: 1 };

const nav = [
  { href: "/", label: "Cleaner" },
  { href: "/guides", label: "Guides" },
  { href: "/pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page render per request, which nonce-based CSP requires
  // (Next adds the proxy's nonce to its own scripts only on dynamic renders).
  await headers();
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn">
          Skip to content
        </a>
        <header className="border-b border-rule bg-surface">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="DataPolish home">
              <Logo />
              <span className="text-[15px] font-semibold tracking-tight">DataPolish</span>
            </Link>
            <nav aria-label="Main">
              <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-2">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="hover:text-ink">
                      {n.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <AccountNav />
                </li>
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-rule bg-surface">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>Files are processed in your browser and never uploaded.</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {[
                ["/guides", "Guides"],
                ["/pricing", "Pricing"],
                ["/privacy", "Privacy"],
                ["/terms", "Terms"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href!} className="hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </footer>
        <PageviewTracker />
      </body>
    </html>
  );
}

/** A 3x3 cell grid with one highlighted cell: the product in one glyph. */
function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="21" fill="#fff" stroke="#1a1e23" />
      <path d="M7.5 0.5v21M14.5 0.5v21M0.5 7.5h21M0.5 14.5h21" stroke="#1a1e23" strokeWidth="1" />
      <rect x="8" y="8" width="6" height="6" fill="#1a43b8" />
    </svg>
  );
}
