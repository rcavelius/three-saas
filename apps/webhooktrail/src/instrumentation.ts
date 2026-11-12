/**
 * Starts the in-process scheduler tick (every 60 s) when RUN_SCHEDULER=1, Node runtime only.
 * A globalThis flag guards against double start (dev hot reload). Schedule claims are atomic in
 * the database, so several instances never double-run a schedule.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_SCHEDULER !== "1") return;
  const g = globalThis as unknown as { __webhooktrailTicker?: boolean };
  if (g.__webhooktrailTicker) return;
  g.__webhooktrailTicker = true;
  const { getPlatform } = await import("./lib/platform");
  const { appLogger } = await import("./lib/log");
  const log = appLogger("ticker");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const p = await getPlatform();
      const r = await p.scheduler.tick({ budgetMs: 50_000 });
      if (r.errors.length) log.warn("tick errors", { errors: r.errors.length });
    } catch (err) {
      log.error("tick failed", { error: (err as Error).message });
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 5_000).unref?.();
  setInterval(() => void tick(), 60_000).unref?.();
}
