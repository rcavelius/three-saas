"use client";

import { useState } from "react";

export function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary !min-h-9 !px-3 text-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? "Link copied" : label}</span>
    </button>
  );
}
