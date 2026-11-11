import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Analytics } from "@/components/Analytics";
import { env } from "@/lib/env";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const base = new URL(env().APP_URL);
  return {
    metadataBase: base,
    title: { default: "SiteProof — a plain-spoken website inspection", template: "%s · SiteProof" },
    description:
      "Free website scanner and monitoring: broken links, titles, meta descriptions, canonicals, image alt text, sitemap, robots.txt, HTTPS and certificate checks, in one readable report.",
    openGraph: {
      type: "website",
      siteName: "SiteProof",
      title: "SiteProof — a plain-spoken website inspection",
      description: "Find broken links, missing titles, sitemap and HTTPS problems in one readable report. Free one-off scans; monitoring from $19/month.",
      url: base.origin,
    },
    twitter: { card: "summary" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f5f1e8",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers renders every page per request, which nonce-based CSP requires
  // (Next adds the nonce from the CSP request header to its own scripts).
  await headers();
  return (
    <html lang="en" className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh flex flex-col bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
