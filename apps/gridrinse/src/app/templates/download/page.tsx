import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { formatFileSize, TEMPLATES } from "@/content/templates";
import { limitByIp } from "@/server/http";
import { getPlatform } from "@/server/platform";
import { downloadView, FILE_LINK_SECONDS } from "@/server/templateShop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your template downloads",
  robots: { index: false, follow: false },
};

const KIND = { excel: "Excel", gsheets: "Google Sheets", guide: "PDF guide" } as const;
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default async function DownloadPage({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : "";
  const p = await getPlatform();
  let limited = false;
  try {
    await limitByIp(p.handle.executor, p.env.clientIp, new Request("http://local/templates/download", { headers: await headers() }), "template-download", 30, 60_000, p.now());
  } catch {
    limited = true;
  }
  const view = limited ? ({ status: "error" } as const) : sessionId ? await downloadView(p, sessionId) : ({ status: "invalid" } as const);

  if (view.status !== "active") {
    const msg: Record<string, [string, string]> = {
      unpaid: ["Payment still processing", "Your payment has not cleared yet. Some payment methods take a few minutes. Reload this page in a moment; we also email your link as soon as the payment is confirmed."],
      expired: ["This download link has expired", "Download links work for 30 days after purchase. Write to support with your receipt and we will send a fresh link."],
      revoked: ["This order was refunded", "A refunded order's download link no longer works."],
      invalid: ["We could not find that order", "Check that you opened the full link from your email. If you paid and still see this, write to support with your Stripe receipt."],
      error: ["Something went wrong", "We could not load your order just now. Please reload the page in a minute. Nothing was charged twice."],
    };
    const [title, body] = msg[view.status] ?? msg.error!;
    return (
      <article>
        <PageHero eyebrow="Template downloads" title={title} narrow art={null}>
          <p>{body}</p>
        </PageHero>
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-8">
          <p className="flex flex-wrap gap-3">
            <Link href="/support" className="btn-pop">
              Contact support
            </Link>
            <Link href="/templates" className="btn-pop btn-pop-ghost bg-surface">
              Browse templates
            </Link>
          </p>
        </div>
      </article>
    );
  }

  const bundle = view.templates.length === TEMPLATES.length && view.templates.length > 1;
  return (
    <article>
      <PageHero eyebrow="Payment confirmed · thank you" title={bundle ? "Your templates are ready" : "Your template is ready"} narrow art={null}>
        <p>
          Download the files below. This page works until {dateLabel(view.accessUntil)}; we emailed you the link too. Save the files somewhere safe: once
          downloaded they are yours to keep.
        </p>
      </PageHero>
      <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-8">
        <ul className="space-y-6">
          {view.templates.map((t) => (
            <li key={t.slug} className="card-pop px-5 py-5 sm:px-6" data-template={t.slug}>
              <h2 className="display text-[2rem] leading-[0.95]">{t.name}</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {t.files.map((f) => (
                  <li key={f.name}>
                    <a href={f.url} download={f.name} className="btn-pop w-full bg-mint text-[1rem]" data-file={f.kind}>
                      {KIND[f.kind]} · {formatFileSize(f.bytes)}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[12.5px] text-ink-2">{t.files.map((f) => f.name).join(" · ")}</p>
            </li>
          ))}
        </ul>
        <div className="card-pop mt-8 bg-mint-soft px-5 py-4 text-[15.5px] leading-relaxed">
          <p>
            <strong>Excel:</strong> open the .xlsx in Excel 2010 or newer. <strong>Google Sheets:</strong> upload the Google Sheets version to Google Drive, then
            right-click → Open with → Google Sheets. Start with the <em>Start Here</em> tab or the PDF guide.
          </p>
          <p className="mt-2 text-ink-2">
            The buttons are fresh for {FILE_LINK_SECONDS / 60} minutes; reload this page for new ones. Problems? <Link href="/support" className="font-semibold underline">Contact support</Link>.
          </p>
        </div>
      </div>
    </article>
  );
}
