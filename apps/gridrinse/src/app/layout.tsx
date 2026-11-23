import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { AccountNav, NavLinks, PageviewTracker } from "@/components/SiteChrome";
import { ogImage } from "@/lib/seo";
import { appUrl } from "@/lib/site";
import "@repo/support/styles.css";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(appUrl()),
    title: { default: "GridRinse — clean CSV and Excel files in your browser", template: "%s · GridRinse" },
    description:
      "Trim spaces, remove blank and duplicate rows, fix dates and numbers, merge files. Runs entirely in your browser; your files are never uploaded.",
    alternates: { canonical: "/" },
    // Defaults for pages without their own (indexable pages set full metadata with pageMeta in src/lib/seo.ts).
    openGraph: {
      type: "website",
      siteName: "GridRinse",
      title: "GridRinse — clean CSV and Excel files in your browser",
      description: "Clean messy spreadsheets in your browser. Files are never uploaded.",
      images: [ogImage()],
    },
    twitter: { card: "summary_large_image", images: [ogImage().url] },
  };
}

export const viewport: Viewport = { themeColor: "#6cd99a", width: "device-width", initialScale: 1 };

const nav = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/guides", label: "Resources" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page render per request, which nonce-based CSP requires
  // (Next adds the proxy's nonce to its own scripts only on dynamic renders).
  await headers();
  return (
    <html lang="en" className={`${jakarta.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn">
          Skip to content
        </a>
        <header className="mint-grid">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8 sm:py-4">
            <Link href="/" className="flex items-center gap-2.5" aria-label="GridRinse home">
              <Logo />
              <span className="text-[1.35rem] font-extrabold tracking-[-0.03em] sm:text-[1.9rem]">GridRinse</span>
            </Link>
            <nav aria-label="Main" className="order-3 w-full overflow-x-auto [scrollbar-width:none] lg:order-none lg:w-auto">
              <NavLinks items={nav} />
            </nav>
            <AccountNav />
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t-2 border-ink bg-paper">
          <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6 text-[15px] sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <Link href="/" className="flex items-center gap-2" aria-label="GridRinse home">
              <Logo size={26} />
              <span className="text-xl font-extrabold tracking-[-0.03em]">GridRinse</span>
            </Link>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 font-medium">
              {[
                ["/tools/remove-duplicates-csv", "Remove duplicates"],
                ["/tools/fix-dates-csv", "Fix dates"],
                ["/tools/merge-csv-files", "Merge CSV files"],
                ["/tools", "All tools"],
                ["/for/bookkeeping-exports", "For bookkeepers"],
                ["/for/ecommerce-exports", "For e-commerce"],
                ["/for/crm-imports", "For CRM imports"],
                ["/guides", "Guides"],
                ["/pricing", "Pricing"],
                ["/support", "Contact"],
                ["/privacy", "Privacy"],
                ["/help", "Help"],
                ["/terms", "Terms"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link href={href!} className="underline-offset-4 hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="mx-auto max-w-[1400px] px-4 pb-6 text-sm text-ink-3 sm:px-8">Files are processed in your browser and never uploaded.</p>
        </footer>
        <PageviewTracker />
      </body>
    </html>
  );
}

/** A 3x3 grid of cells: the product in one glyph. */
function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={c * 10.5} y={r * 10.5} width="9" height="9" rx="1.6" fill="#111" />))}
    </svg>
  );
}
