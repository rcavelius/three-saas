import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/content/guides";

export const metadata: Metadata = { title: "Guides", description: "Practical guides to fixing dates, duplicates, number formats and merged exports." };

export default function GuidesIndex() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-6">
      <p className="eyebrow">Guides</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Fixing spreadsheet data, properly</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">Short, practical notes on the problems that show up in almost every export, and how to fix each one without losing data.</p>
      <ol className="mt-8 border-t border-rule">
        {GUIDES.map((g, i) => (
          <li key={g.slug} className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b border-rule py-4">
            <span className="font-mono text-sm text-ink-3">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2 className="text-lg font-semibold">
                <Link href={`/guides/${g.slug}`} className="hover:text-accent">
                  {g.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-ink-2">{g.summary}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
