/**
 * In-process scheduler: with RUN_SCHEDULER=1 every server instance ticks the Postgres job queue every
 * 60 s (schedule claims are atomic, so several instances never double-run). /api/cron/tick does the
 * same for platforms driven by an external cron.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_SCHEDULER !== "1") return;
  const g = globalThis as unknown as { __gridrinseTicker?: ReturnType<typeof setInterval> };
  if (g.__gridrinseTicker) return; // dev hot reload: one ticker per process
  const { getPlatform } = await import("./server/platform");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const p = await getPlatform();
      await p.scheduler.tick({ budgetMs: 50_000 });
    } catch (e) {
      console.error("[gridrinse] scheduler tick failed", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  g.__gridrinseTicker = setInterval(() => void tick(), 60_000);
  g.__gridrinseTicker.unref?.();
  void tick();
}
