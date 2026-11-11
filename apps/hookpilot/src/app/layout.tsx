import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Pageview } from "@/components/Pageview";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getOperator } from "@/lib/admin";
import { getPlatform } from "@/lib/platform";
import "./globals.css";

const grotesk = Inter_Tight({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

// Nonce-based CSP needs per-request rendering of every page.
export const dynamic = "force-dynamic";

const APP_URL =process.env.APP_URL || "http://localhost:3003";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "HookPilot: webhook capture, inspection and replay", template: "%s · HookPilot" },
  description:
    "Create a webhook endpoint in one click, capture every request and inspect headers, query and body in a live console. Replay to verified destinations on paid plans.",
  referrer: "no-referrer",
  openGraph: {
    type: "website",
    siteName: "HookPilot",
    title: "HookPilot: webhook capture, inspection and replay",
    description: "One-click webhook endpoints with a live inspector, masked secrets and safe replay to verified destinations.",
    url: "/",
  },
  twitter: { card: "summary" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0c",
  colorScheme: "dark",
};

async function headerState(): Promise<{ signedIn: boolean; operator: boolean }> {
  try {
    const h = new Headers(await headers());
    if (!/hp\.session_token=/.test(h.get("cookie") ?? "")) return { signedIn: false, operator: false };
    const p = await getPlatform();
    const s = await p.auth.getSession(h);
    if (!s) return { signedIn: false, operator: false };
    return { signedIn: true, operator: Boolean(await getOperator(p, h)) };
  } catch {
    return { signedIn: false, operator: false };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers makes every page dynamic, which nonce-based CSP requires (proxy.ts).
  const state = await headerState();
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn btn-signal">
          Skip to content
        </a>
        <SiteHeader signedIn={state.signedIn} operator={state.operator} />
        <main id="main" className="flex-1 flex flex-col">
          {children}
        </main>
        <SiteFooter />
        <Pageview />
      </body>
    </html>
  );
}
