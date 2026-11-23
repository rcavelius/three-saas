/**
 * The three app catalogs as data, shared by the apps (enforcement + pricing pages), the ops
 * dashboard (MRR from plan prices) and scripts/setup-stripe-test.ts (Stripe products/prices).
 *
 * Conventions:
 * - -1 = unlimited, 0 = not available on this plan.
 * - Free limits match the free tiers that were live before accounts existed.
 * - Paid limits for GridRinse and WebhookTrail match the values already shown on their pricing
 *   pages; ChangeKite paid crawl sizes/frequencies are new (pricing page only listed site counts).
 * - Lookup keys are "<app>_<plan>_monthly" and must never be reused for a different price
 *   (to change a price, create a new Stripe Price and transfer the lookup key to it).
 */
import { defineCatalog, type Catalog } from "./catalog";

export const CHANGEKITE_CATALOG: Catalog = defineCatalog({
  app: "changekite",
  freePlanId: "free",
  plans: [
    {
      id: "free",
      name: "Free",
      priceMonthlyCents: 0,
      limits: {
        sites: 0, // monitored sites; free = one-off scans only
        pagesPerScan: 25,
        scanFrequencyHours: 0, // minimum hours between scheduled scans; 0 = no scheduled scans
        historyDays: 0,
        teamSeats: 1,
        reportIssues: 3, // issues listed per report; the rest (and their fixes) are behind the paywall; -1 = all
      },
      features: { scheduledScans: false, emailAlerts: false, reportHistory: false, pdfReports: false, priorityQueue: false, fullReport: false },
    },
    {
      id: "solo",
      name: "Solo",
      priceMonthlyCents: 1900,
      stripeLookupKey: "changekite_solo_monthly",
      limits: { sites: 3, pagesPerScan: 250, scanFrequencyHours: 24, historyDays: 90, teamSeats: 1, reportIssues: -1 },
      features: { scheduledScans: true, emailAlerts: true, reportHistory: true, pdfReports: false, priorityQueue: false, fullReport: true },
    },
    {
      id: "agency",
      name: "Agency",
      priceMonthlyCents: 7900,
      stripeLookupKey: "changekite_agency_monthly",
      limits: { sites: 20, pagesPerScan: 1000, scanFrequencyHours: 6, historyDays: 365, teamSeats: 5, reportIssues: -1 },
      features: { scheduledScans: true, emailAlerts: true, reportHistory: true, pdfReports: true, priorityQueue: true, fullReport: true },
    },
  ],
  passes: [
    {
      // One-off site audit: the full issue list with fixes on every report, deeper scans and the PDF, for 7 days
      // (long enough to fix and rescan). No monitoring: that stays on the monthly plans.
      id: "report",
      name: "Full-site report",
      priceCents: 900,
      durationHours: 24 * 7,
      stripeLookupKey: "changekite_report_pass",
      limits: { pagesPerScan: 250, reportIssues: -1 },
      features: { fullReport: true, pdfReports: true },
    },
  ],
});

export const GRIDRINSE_CATALOG: Catalog = defineCatalog({
  app: "gridrinse",
  freePlanId: "free",
  plans: [
    {
      id: "free",
      name: "Free",
      priceMonthlyCents: 0,
      // Free = preview anything up to 5 MB / 50k rows; download one cleaned file a day of up to 1,000 rows.
      limits: { maxFileMb: 5, maxRows: 50_000, filesPerBatch: 3, savedWorkflows: 0, teamSeats: 1, downloadRows: 1_000, downloadsPerDay: 1 },
      features: { cloudWorkflows: false, sharedTeamWorkflows: false, prioritySupport: false },
    },
    {
      id: "pro",
      name: "Pro",
      priceMonthlyCents: 900,
      stripeLookupKey: "gridrinse_pro_monthly",
      limits: { maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20, savedWorkflows: 50, teamSeats: 1, downloadRows: -1, downloadsPerDay: -1 },
      features: { cloudWorkflows: true, sharedTeamWorkflows: false, prioritySupport: false },
    },
    {
      id: "business",
      name: "Business",
      priceMonthlyCents: 2900,
      stripeLookupKey: "gridrinse_business_monthly",
      limits: { maxFileMb: 200, maxRows: 2_000_000, filesPerBatch: 100, savedWorkflows: -1, teamSeats: 5, downloadRows: -1, downloadsPerDay: -1 },
      features: { cloudWorkflows: true, sharedTeamWorkflows: true, prioritySupport: true },
    },
  ],
  passes: [
    {
      // One-off jobs: Pro processing limits and unlimited downloads for 24 hours, no account needed.
      id: "day",
      name: "24-hour pass",
      priceCents: 500,
      durationHours: 24,
      stripeLookupKey: "gridrinse_day_pass",
      limits: { maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20, downloadRows: -1, downloadsPerDay: -1 },
      features: {},
    },
  ],
});

export const WEBHOOKTRAIL_CATALOG: Catalog = defineCatalog({
  app: "webhooktrail",
  freePlanId: "free",
  plans: [
    {
      id: "free",
      name: "Free",
      priceMonthlyCents: 0,
      limits: {
        endpoints: 3, // active endpoints
        endpointRetentionHours: 24, // endpoint time-to-live
        requestsStored: 100, // per endpoint, oldest pruned
        requestsPerMonth: 3_000, // captured requests per org per calendar month
        historyDays: 1,
        storedBodyKb: 256, // bytes of each body that are stored
        maxPayloadKb: 1024, // larger bodies are rejected with 413
        teamSeats: 1,
      },
      features: { replay: false, customResponses: true },
    },
    {
      id: "developer",
      name: "Developer",
      priceMonthlyCents: 900,
      stripeLookupKey: "webhooktrail_developer_monthly",
      limits: {
        endpoints: 25,
        endpointRetentionHours: 24 * 7,
        requestsStored: 2_000,
        requestsPerMonth: 100_000,
        historyDays: 7,
        storedBodyKb: 1024,
        maxPayloadKb: 2048,
        teamSeats: 1,
      },
      features: { replay: true, customResponses: true },
    },
    {
      id: "pro",
      name: "Pro",
      priceMonthlyCents: 2900,
      stripeLookupKey: "webhooktrail_pro_monthly",
      limits: {
        endpoints: 100,
        endpointRetentionHours: 24 * 30,
        requestsStored: 10_000,
        requestsPerMonth: 1_000_000,
        historyDays: 30,
        storedBodyKb: 5120,
        maxPayloadKb: 10_240,
        teamSeats: 5,
      },
      features: { replay: true, customResponses: true },
    },
  ],
  passes: [
    {
      // A week of debugging an integration: replay plus the Developer capture limits, for 7 days.
      id: "week",
      name: "7-day pass",
      priceCents: 500,
      durationHours: 24 * 7,
      stripeLookupKey: "webhooktrail_week_pass",
      limits: {
        endpoints: 25,
        endpointRetentionHours: 24 * 7,
        requestsStored: 2_000,
        requestsPerMonth: 100_000,
        historyDays: 7,
        storedBodyKb: 1024,
        maxPayloadKb: 2048,
      },
      features: { replay: true },
    },
  ],
});

export const ALL_CATALOGS: readonly Catalog[] = [CHANGEKITE_CATALOG, GRIDRINSE_CATALOG, WEBHOOKTRAIL_CATALOG];
