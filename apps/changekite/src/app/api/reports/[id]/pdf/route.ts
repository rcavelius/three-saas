import { rateLimit } from "@repo/database";
import { getPlatform } from "@/lib/platform";
import { loadReportView } from "@/lib/report-access";
import { SCAN_ID_PATTERN } from "@/lib/scans-repo";
import { generateReportPdf } from "@/lib/pdf";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_PER_HOUR = 30;

/**
 * Server-generated PDF for viewers with `pdfReports` (Agency plan, or an active Full-site report pass). Account
 * reports stay org-scoped (non-members get 404, same as a missing report); anonymous reports are reachable by
 * their unguessable id like the HTML report. Everyone else keeps browser printing.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!SCAN_ID_PATTERN.test(id)) return json(404, { error: "not_found" });
  const p = await getPlatform();
  const view = await loadReportView(p, req.headers, id);
  if (!view) return json(404, { error: "not_found" });
  const { scan, ents } = view;
  if (!ents.features.pdfReports) {
    return json(403, {
      error: "plan_required",
      message: "PDF export is included in the Full-site report pass and the Agency plan. Use Print to save a PDF from your browser.",
    });
  }
  let workspace = "Full-site report";
  if (scan.orgId) {
    const { rows } = await p.handle.executor.query<{ name: string }>(`SELECT name FROM auth_organization WHERE id = $1`, [scan.orgId]);
    workspace = rows[0]?.name ?? "Workspace";
  }
  // Rate limit per payer: the org of an account report, else the pass (or the viewer's org) that granted the PDF.
  const payer = scan.orgId ?? ents.pass?.id ?? "anon";
  const rl = await rateLimit(p.handle.executor, `pdf:${payer}`, PDF_PER_HOUR, 3_600_000, p.now());
  if (!rl.allowed) {
    return json(429, { error: "rate_limited", message: "Too many PDF exports this hour." }, { "retry-after": String(Math.max(1, Math.ceil((rl.resetAt.getTime() - p.now().getTime()) / 1000))) });
  }
  // view.report is the copy this viewer may see (the full report for every pdfReports holder in the catalog).
  const pdf = await generateReportPdf(view.report, {
    workspace,
    generatedAt: p.now(),
    reportUrl: `${new URL(p.env.APP_URL).origin}/report/${scan.id}`,
  });
  const host = new URL(scan.report.startUrl).host.replace(/[^a-z0-9.-]/gi, "_");
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="changekite-${host}-${scan.createdAt.slice(0, 10)}.pdf"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
