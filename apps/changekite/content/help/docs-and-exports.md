---
title: Documentation, guides and exporting reports
slug: docs-and-exports
summary: Where to find the check reference and how-to guides, and how to export a ChangeKite report as JSON or PDF.
category: API & integrations
updated: 2026-11-11
---
## Reference documentation

- [What we check](/docs) explains every check in detail: why it matters, exactly how ChangeKite tests it, and how findings are graded. It also explains the score.
- [ChangeKiteBot](/bot) describes the crawler: its user agent, what it does and never does, and how to block or slow it with robots.txt.

## Guides

The [guides](/guides) are step-by-step articles for the most common problems:

- [How to find and fix broken internal links](/guides/find-and-fix-broken-links)
- [Stop your HTTPS certificate from expiring unnoticed](/guides/tls-certificate-expiry)
- [Is robots.txt blocking your whole site?](/guides/robots-txt-blocking-search-engines)

## Exporting a report as JSON

Every report has a **JSON** button. It opens the full report data at `/api/report/<id>`, where `<id>` is the id from the report link.

- For a free report, anyone with the link can open the JSON, just like the report itself. Without a pass or plan it contains the same as the free report: the summary and the 3 most severe issues, plus counts of the rest.
- For a report of a monitored site, you must be signed in as a member of the workspace. Everyone else gets "not found".

The JSON contains the report id, when it was created, and the full report.

## Exporting a report as PDF

- **Agency plan**: reports of monitored sites have a **Download PDF** button that creates a PDF on the server. Each workspace can export up to 30 PDFs per hour.
- **Full-site report pass**: while the pass is active, every report you open has a **Download PDF** button (up to 30 PDFs per hour).
- **Free scans, Free and Solo plans**: use the **Print / PDF** button on the report and choose "Save as PDF" in your browser's print dialog.

## Sharing a report

Free reports have a **Copy link** button. Anyone with the link can view the report until it expires, 90 days by default. Reports of monitored sites can only be opened by members of your workspace, so invite colleagues to the workspace instead of sending them a link. See [Team members and roles](/help/team-members-and-roles).

## Is there an API?

ChangeKite does not offer a public API with API keys, webhooks or third-party integrations. Scans are started from the website: free scans on the [home page](/), and monitored sites from [Monitored sites](/dashboard). The JSON export above is the way to get report data into your own tools.
