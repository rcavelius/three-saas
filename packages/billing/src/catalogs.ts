/**
 * The three app catalogs as data, shared by the apps (enforcement + pricing pages), the ops
 * dashboard (MRR from plan prices) and scripts/setup-stripe-test.ts (Stripe products/prices).
 *
 * Conventions:
 * - -1 = unlimited, 0 = not available on this plan.
 * - Free limits match the free tiers that were live before accounts existed.
 * - Paid limits for DataPolish and WebhookTrail match the values already shown on their pricing
 *   pages; SiteProof paid crawl sizes/frequencies are new (pricing page only listed site counts).
 * - Lookup keys are "<app>_<plan>_monthly" and must never be reused for a different price
 *   (to change a price, create a new Stripe Price and transfer the lookup key to it).
 */
import { defineCatalog, type Catalog } from "./catalog";

export const SITEPROOF_CATALOG: Catalog = defineCatalog({
  app: "siteproof",
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
      },
      features: { scheduledScans: false, emailAlerts: false, reportHistory: false, pdfReports: false, priorityQueue: false },
    },
    {
      id: "solo",
      name: "Solo",
      priceMonthlyCents: 1900,
      stripeLookupKey: "siteproof_solo_monthly",
      limits: { sites: 3, pagesPerScan: 250, scanFrequencyHours: 24, historyDays: 90, teamSeats: 1 },
      features: { scheduledScans: true, emailAlerts: true, reportHistory: true, pdfReports: false, priorityQueue: false },
    },
    {
      id: "agency",
      name: "Agency",
      priceMonthlyCents: 7900,
      stripeLookupKey: "siteproof_agency_monthly",
      limits: { sites: 20, pagesPerScan: 1000, scanFrequencyHours: 6, historyDays: 365, teamSeats: 5 },
      features: { scheduledScans: true, emailAlerts: true, reportHistory: true, pdfReports: true, priorityQueue: true },
    },
  ],
});

export const DATAPOLISH_CATALOG: Catalog = defineCatalog({
  app: "datapolish",
  freePlanId: "free",
  plans: [
    {
      id: "free",
      name: "Free",
      priceMonthlyCents: 0,
      limits: { maxFileMb: 5, maxRows: 50_000, filesPerBatch: 3, savedWorkflows: 0, teamSeats: 1 },
      features: { cloudWorkflows: false, sharedTeamWorkflows: false, prioritySupport: false },
    },
    {
      id: "pro",
      name: "Pro",
      priceMonthlyCents: 1200,
      stripeLookupKey: "datapolish_pro_monthly",
      limits: { maxFileMb: 50, maxRows: 500_000, filesPerBatch: 20, savedWorkflows: 50, teamSeats: 1 },
      features: { cloudWorkflows: true, sharedTeamWorkflows: false, prioritySupport: false },
    },
    {
      id: "business",
      name: "Business",
      priceMonthlyCents: 2900,
      stripeLookupKey: "datapolish_business_monthly",
      limits: { maxFileMb: 200, maxRows: 2_000_000, filesPerBatch: 100, savedWorkflows: -1, teamSeats: 5 },
      features: { cloudWorkflows: true, sharedTeamWorkflows: true, prioritySupport: true },
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
});

export const ALL_CATALOGS: readonly Catalog[] = [SITEPROOF_CATALOG, DATAPOLISH_CATALOG, WEBHOOKTRAIL_CATALOG];
