import { getTool } from "@/content/tools";
import { sampleFileIndex, toolSample } from "@/content/tool-samples";
import { toXlsx } from "@/lib/engine/export";
import { parseCsv } from "@/lib/engine/parse";

export const runtime = "nodejs";

/** Messy sample files for the /tools pages (invented data). Only names from the sample index are served. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const index = sampleFileIndex();
  const headers = (type: string) => ({
    "content-type": type,
    "content-disposition": `attachment; filename="${file}"`,
    "cache-control": "public, max-age=86400",
    "x-robots-tag": "noindex",
  });

  const csvHit = index.get(file);
  if (csvHit) return new Response(csvHit.csv, { headers: headers("text/csv; charset=utf-8") });

  if (file.endsWith(".xlsx")) {
    const hit = index.get(file.replace(/\.xlsx$/, ".csv"));
    const tool = hit && getTool(hit.slug);
    if (hit && tool && toolSample(tool).xlsx) {
      const bytes = toXlsx([{ name: "Sample", table: parseCsv(hit.csv).table }], { typeNumbers: false });
      return new Response(bytes as BodyInit, { headers: headers("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") });
    }
  }
  return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
}
