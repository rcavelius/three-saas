import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Fraunces, Manrope } from "next/font/google";
import "@repo/support/styles.css";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Analytics } from "@/components/Analytics";
import { Reveal } from "@/components/Reveal";
import { env } from "@/lib/env";
import { CHANGEKITE_CATALOG, getPass, paidPlans } from "@repo/billing";
import { price } from "@/lib/marketing";

const reportPass = getPass(CHANGEKITE_CATALOG, "report")!;
const PASS_PRICE = `$${(reportPass.priceCents / 100).toFixed(reportPass.priceCents % 100 ? 2 : 0)}`;
const FROM_PRICE = `${price(paidPlans(CHANGEKITE_CATALOG).sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents)[0]!)}/month`;

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["opsz"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const base = new URL(env().APP_URL);
  return {
    metadataBase: base,
    title: { default: "ChangeKite — a plain-spoken website inspection", template: "%s · ChangeKite" },
    description:
      "Website scanner and monitoring: broken links, titles, meta descriptions, canonicals, image alt text, sitemap, robots.txt, HTTPS and certificate checks. Free scan with a summary and the top issues.",
    openGraph: {
      type: "website",
      siteName: "ChangeKite",
      title: "ChangeKite — a plain-spoken website inspection",
      description: `Find broken links, missing titles, sitemap and HTTPS problems in one readable report. Free scan with summary and top issues; full report ${PASS_PRICE} one-time; monitoring from ${FROM_PRICE}.`,
      url: base.origin,
    },
    twitter: { card: "summary" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f7f3ea",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers renders every page per request, which nonce-based CSP requires
  // (Next adds the nonce from the CSP request header to its own scripts).
  await headers();
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`}>
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
        <Reveal />
      </body>
    </html>
  );
}
