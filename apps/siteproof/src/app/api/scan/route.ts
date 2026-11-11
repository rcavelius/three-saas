import { createScanHandler, ScanSlots } from "@/lib/scan-handler";
import { createProductionDeps } from "@/lib/scanner/deps";
import { getPlatform } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const g = globalThis as unknown as { __siteproofSlots?: ScanSlots; __siteproofScanHandler?: (req: Request) => Promise<Response> };

async function handler() {
  if (!g.__siteproofScanHandler) {
    const p = await getPlatform();
    const e = p.env;
    g.__siteproofSlots ??= new ScanSlots(e.MAX_CONCURRENT_SCANS);
    g.__siteproofScanHandler = createScanHandler({
      getExecutor: async () => p.handle.executor,
      scanDeps: () => createProductionDeps(e.APP_URL),
      slots: g.__siteproofSlots,
      ipLimitPerHour: e.SCAN_RATE_LIMIT_PER_HOUR,
      targetLimitPerHour: e.SCAN_TARGET_LIMIT_PER_HOUR,
      retentionDays: e.REPORT_RETENTION_DAYS,
      clientIp: p.clientIp,
      appUrl: e.APP_URL,
      logger: p.logger.child({ route: "api/scan" }),
    });
  }
  return g.__siteproofScanHandler;
}

export async function POST(req: Request): Promise<Response> {
  return (await handler())(req);
}
