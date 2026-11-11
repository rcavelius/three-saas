/**
 * Server-generated PDF of a scan report (pdfkit, built-in Helvetica: no font files, no network).
 * Content mirrors the HTML report: summary, checks, then every issue grouped by severity.
 */
import PDFDocument from "pdfkit";
import type { ScanReport, Severity } from "./scanner/types";

const INK = "#1c1a16";
const MUTED = "#625d53";
const ACCENT = "#1d3a66";
const SEV_COLOR: Record<Severity, string> = { critical: "#a3271c", warning: "#875600", notice: "#3d3933" };
const MAX_ISSUES = 600;

/** pdfkit's built-in fonts are WinAnsi: replace characters they cannot encode. */
function t(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

export function generateReportPdf(report: ScanReport, meta: { workspace: string; generatedAt: Date; reportUrl: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: { Title: t(`SiteProof report: ${new URL(report.startUrl).host}`), Author: "SiteProof", Subject: t(report.startUrl) },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - 100;
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(t(`SITEPROOF INSPECTION REPORT - ${meta.workspace}`), { characterSpacing: 1 });
    doc.moveDown(0.5);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(22).text(t(new URL(report.startUrl).host));
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(t(report.startUrl));
    doc.moveDown(0.8);
    doc.fillColor(INK).fontSize(11);
    const finished = new Date(report.finishedAt);
    doc.text(t(`Scanned ${finished.toISOString().replace("T", " ").slice(0, 16)} UTC - ${report.stats.pagesCrawled} pages in ${Math.round(report.durationMs / 1000)} s`));
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(32).fillColor(ACCENT).text(`${report.score}`, { continued: true });
    doc.font("Helvetica").fontSize(12).fillColor(MUTED).text("  / 100 score");
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(INK).text(
      `${report.counts.critical} critical   ${report.counts.warning} warnings   ${report.counts.notice} notices`,
    );
    const notReached: string[] = [];
    if (report.stats.pageCapReached) notReached.push(`page cap of ${report.limits.maxPages} reached`);
    if (report.stats.timeBudgetExhausted) notReached.push("time budget used up");
    if (report.stats.pagesSkippedByRobots) notReached.push(`${report.stats.pagesSkippedByRobots} pages skipped by robots.txt`);
    if (notReached.length) {
      doc.moveDown(0.3).fontSize(9).fillColor(MUTED).text(t(`Coverage: ${notReached.join("; ")}. Pages not reached were not checked.`));
    }

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text("Checks");
    doc.moveDown(0.3);
    for (const c of report.checks) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(t(`${c.label}: ${c.status.toUpperCase()}`), { continued: false });
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(t(c.summary), { width });
      doc.moveDown(0.2);
    }

    const order: Severity[] = ["critical", "warning", "notice"];
    let written = 0;
    for (const sev of order) {
      const list = report.issues.filter((i) => i.severity === sev);
      if (!list.length) continue;
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(14).fillColor(SEV_COLOR[sev]).text(`${sev[0]!.toUpperCase()}${sev.slice(1)} (${list.length})`);
      doc.moveDown(0.4);
      for (const i of list) {
        if (written >= MAX_ISSUES) break;
        written++;
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(t(i.message), { width });
        if (i.page) doc.font("Helvetica").fontSize(8.5).fillColor(ACCENT).text(t(i.page), { width });
        if (i.detail) doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(t(i.detail.slice(0, 600)), { width });
        doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(INK).text(t(`Fix: ${i.howToFix}`), { width });
        doc.moveDown(0.5);
      }
    }
    if (report.issues.length > MAX_ISSUES) {
      doc.moveDown().font("Helvetica").fontSize(9).fillColor(MUTED).text(`${report.issues.length - MAX_ISSUES} more issues are listed in the online report.`);
    }

    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
      doc.switchToPage(p);
      doc.page.margins.bottom = 0; // writing into the footer area must not add a page
      const y = doc.page.height - 35;
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
      doc.text(t(`Generated ${meta.generatedAt.toISOString().slice(0, 10)} - ${meta.reportUrl} - page ${p + 1} of ${range.count}`), 50, y, {
        width,
        align: "center",
        lineBreak: false,
      });
    }
    doc.end();
  });
}
