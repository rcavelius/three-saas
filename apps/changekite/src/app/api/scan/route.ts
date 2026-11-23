import { createScanHandler, ScanSlots } from "@/lib/scan-handler";
import { createProductionDeps } from "@/lib/scanner/deps";
import { getPlatform } from "@/lib/platform";
import { visitorAccess } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pass holders may scan up to 250 pages (time budget up to ~70 s).
export const maxDuration = 180;

const g = globalThis as unknown as { __changekiteSlots?: ScanSlots; __changekiteScanHandler?: (req: Request) => Promise<Response> };

async function handler() {
  if (!g.__changekiteScanHandler) {
    const p = await getPlatform();
    const e = p.env;
    g.__changekiteSlots ??= new ScanSlots(e.MAX_CONCURRENT_SCANS);
    g.__changekiteScanHandler = createScanHandler({
      getExecutor: async () => p.handle.executor,
      scanDeps: () => createProductionDeps(e.APP_URL),
      slots: g.__changekiteSlots,
      ipLimitPerHour: e.SCAN_RATE_LIMIT_PER_HOUR,
      targetLimitPerHour: e.SCAN_TARGET_LIMIT_PER_HOUR,
      retentionDays: e.REPORT_RETENTION_DAYS,
      clientIp: p.clientIp,
      appUrl: e.APP_URL,
      logger: p.logger.child({ route: "api/scan" }),
      // Signed-in plan + pass cookie: page cap and how much of the report is returned.
      resolveAccess: async (req) => (await visitorAccess(p, req.headers)).ents,
    });
  }
  return g.__changekiteScanHandler;
}

export async function POST(req: Request): Promise<Response> {
  return (await handler())(req);
}
