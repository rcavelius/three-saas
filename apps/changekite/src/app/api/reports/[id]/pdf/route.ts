import { rateLimit } from "@repo/database";
import { getPlatform } from "@/lib/platform";
import { getScan, SCAN_ID_PATTERN } from "@/lib/scans-repo";
import { generateReportPdf } from "@/lib/pdf";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_PER_ORG_PER_HOUR = 30;

/**
 * Server-generated PDF for account reports on plans with `pdfReports`. Org-scoped: non-members get 404
 * (same as a missing report). Anonymous reports keep browser printing.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!SCAN_ID_PATTERN.test(id)) return json(404, { error: "not_found" });
  const p = await getPlatform();
  const scan = await getScan(p.handle.executor, id, p.now());
  if (!scan || !scan.orgId) return json(404, { error: "not_found" });
  let org: { id: string; name: string };
  try {
    org = (await p.auth.requireOrg(req.headers, { orgId: scan.orgId })).org;
  } catch {
    return json(404, { error: "not_found" });
  }
  const ents = await p.billing.getEntitlements(org.id);
  if (!ents.features.pdfReports) {
    return json(403, { error: "plan_required", message: "PDF export is included in the Agency plan. Use Print to save a PDF from your browser." });
  }
  const rl = await rateLimit(p.handle.executor, `pdf:${org.id}`, PDF_PER_ORG_PER_HOUR, 3_600_000, p.now());
  if (!rl.allowed) {
    return json(429, { error: "rate_limited", message: "Too many PDF exports this hour." }, { "retry-after": String(Math.max(1, Math.ceil((rl.resetAt.getTime() - p.now().getTime()) / 1000))) });
  }
  const pdf = await generateReportPdf(scan.report, {
    workspace: org.name,
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
