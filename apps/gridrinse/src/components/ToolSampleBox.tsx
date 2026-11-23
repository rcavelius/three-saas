"use client";

import { track } from "@/lib/analytics";
import { CLEANER_EVENTS } from "@/lib/cleaner-events";

/** "No file handy?" on a /tools page: load the page's messy sample into the cleaner, or download it to look at first. */
export function ToolSampleBox({ files, xlsxName }: { files: string[]; xlsxName?: string }) {
  const link = "text-[16px] font-extrabold underline decoration-2 underline-offset-4";
  return (
    <div className="relative mx-auto -mt-7 flex max-w-[1400px] flex-col gap-3 px-4 sm:px-8">
      <div className="card-pop flex flex-col gap-3 bg-pink px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[17px] font-extrabold">No file handy? Use our messy sample{files.length > 1 ? " files" : ""}.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            type="button"
            className="btn-pop !min-h-10 !px-4 !text-[15px]"
            onClick={() => {
              window.dispatchEvent(new Event(CLEANER_EVENTS.sample));
              document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Clean the sample now
          </button>
          {files.map((f) => (
            <a key={f} href={`/samples/${f}`} download className={link} onClick={() => track("sample_downloaded")}>
              Download {files.length > 1 ? f.replace(/^.*-sample-?/, "").replace(/\.csv$/, "") || "sample" : "sample"} .csv
            </a>
          ))}
          {xlsxName && (
            <a href={`/samples/${xlsxName}`} download className={link} onClick={() => track("sample_downloaded")}>
              Download sample .xlsx
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
