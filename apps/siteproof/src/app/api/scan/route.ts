import { createLogger } from "@repo/monitoring";
import { createScanHandler, ScanSlots } from "@/lib/scan-handler";
import { createProductionDeps } from "@/lib/scanner/deps";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const g = globalThis as unknown as { __siteproofSlots?: ScanSlots; __siteproofScanHandler?: (req: Request) => Promise<Response> };

function handler() {
  if (!g.__siteproofScanHandler) {
    const e = env();
    g.__siteproofSlots ??= new ScanSlots(e.MAX_CONCURRENT_SCANS);
    g.__siteproofScanHandler = createScanHandler({
      getExecutor: async () => (await getDb()).executor,
      scanDeps: () => createProductionDeps(e.APP_URL),
      slots: g.__siteproofSlots,
      ipLimitPerHour: e.SCAN_RATE_LIMIT_PER_HOUR,
      targetLimitPerHour: e.SCAN_TARGET_LIMIT_PER_HOUR,
      retentionDays: e.REPORT_RETENTION_DAYS,
      trustedIpHeader: e.TRUSTED_IP_HEADER,
      appUrl: e.APP_URL,
      logger: createLogger({ app: "siteproof", route: "api/scan" }),
    });
  }
  return g.__siteproofScanHandler;
}

export async function POST(req: Request): Promise<Response> {
  return handler()(req);
}
