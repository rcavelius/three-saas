import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import { AccountNav, NavLinks, PageviewTracker } from "@/components/SiteChrome";
import { ogImage } from "@/lib/seo";
import { appUrl } from "@/lib/site";
import "@repo/support/styles.css";
import "./globals.css";

// Fonts: Latin only (Latin-1 accents included), one variable file for the text face, and only the two faces seen on
// the first screen are preloaded. The monospace face appears only inside data tables and code, so it loads on use.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: "400", variable: "--font-plex-mono", display: "swap", preload: false });

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

export const viewport: Viewport = { themeColor: "#1e3bff", width: "device-width", initialScale: 1 };

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
    <html lang="en" className={`${jakarta.variable} ${anton.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 btn">
          Skip to content
        </a>
        <header className="mint-grid px-2.5 pb-1 pt-2.5 sm:px-6 sm:pt-4">
          <div className="card-pop mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-1 !rounded-[16px] px-3 py-2 sm:px-5 sm:py-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="GridRinse home">
              <Logo />
              <span className="text-[1.3rem] font-extrabold tracking-[-0.035em] sm:text-[1.85rem]">GridRinse</span>
            </Link>
            <nav aria-label="Main" className="order-3 -mx-1 w-full overflow-x-auto [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto">
              <NavLinks items={nav} />
            </nav>
            <AccountNav />
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="bg-ink text-white">
          <div className="mx-auto max-w-[1400px] px-4 pt-12 sm:px-8 sm:pt-16">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <p className="flex max-w-[26rem] items-center gap-3 text-[18px] font-bold leading-snug sm:text-[20px]">
                <picture>
                  <source srcSet="/art/lock.avif" type="image/avif" />
                  <img src="/art/lock.webp" alt="" width={48} height={67} loading="lazy" decoding="async" className="h-auto w-12 shrink-0" />
                </picture>
                Files are processed in your browser and never uploaded.
              </p>
              <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[16px] font-semibold sm:grid-cols-3">
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
                    <Link href={href!} className="underline-offset-4 hover:text-mint hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/" aria-label="GridRinse home" className="display mt-12 block select-none pb-6 text-center text-[19vw] leading-[0.9] text-mint sm:pb-10 lg:text-[17.5rem]">
              GridRinse
            </Link>
          </div>
        </footer>
        <PageviewTracker />
      </body>
    </html>
  );
}

/** A 3x3 grid of lime cells with one cobalt cell: the product in one glyph. */
function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="1.5" y="1.5" width="31" height="31" rx="5" fill="#0a0a0a" />
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={4.5 + c * 8.7} y={4.5 + r * 8.7} width="7.3" height="7.3" rx="1.4" fill={r === 1 && c === 2 ? "#1e3bff" : "#c6ff3a"} />))}
    </svg>
  );
}
