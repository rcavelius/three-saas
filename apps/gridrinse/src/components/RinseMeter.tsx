/**
 * The Cleaner's score bar: once a run finishes, a lime bar sweeps to full and the counts of what was fixed sit on it.
 * It restarts its sweep whenever the counts change (the parent keys it), so every new step reads as a new "level".
 */
export function RinseMeter({ fixed, removed }: { fixed: number; removed: number }) {
  const total = fixed + removed;
  return (
    <div className="mt-2 flex max-w-[34rem] items-center gap-3" role="status">
      <div className="relative h-10 min-w-0 flex-1 overflow-hidden rounded-full border-[3px] border-ink bg-surface">
        <span className="rinse-meter-live absolute inset-0 origin-left bg-mint" aria-hidden="true" />
        <span className="relative flex h-full items-center px-4 text-[15px] font-extrabold whitespace-nowrap sm:text-[16px]">
          {fixed.toLocaleString("en-US")} cells fixed · {removed.toLocaleString("en-US")} rows removed
        </span>
      </div>
      <span className="display shrink-0 text-[1.7rem] leading-none" aria-hidden="true">
        {total > 0 ? "Rinsed!" : "Clean"}
      </span>
    </div>
  );
}
