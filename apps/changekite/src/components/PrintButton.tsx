"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary !min-h-9 !px-3 text-sm">
      Print / PDF
    </button>
  );
}
