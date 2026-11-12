/**
 * In-process scheduler: with RUN_SCHEDULER=1 each instance ticks every 60 s (Node runtime only).
 * Schedule claims are atomic in Postgres, so several instances never double-run a schedule.
 * A tick never overlaps the previous one, and the timer is created once per process (dev reloads).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_SCHEDULER !== "1") return;
  const g = globalThis as unknown as { __changekiteTicker?: ReturnType<typeof setInterval> };
  if (g.__changekiteTicker) return;
  const { getPlatform } = await import("./lib/platform");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const p = await getPlatform();
      const r = await p.scheduler.tick({ budgetMs: 50_000 });
      if (r.errors.length) p.logger.warn("scheduler tick errors", { errors: r.errors.slice(0, 5) });
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: "scheduler tick failed", error: err instanceof Error ? err.message : String(err) }));
    } finally {
      running = false;
    }
  };
  g.__changekiteTicker = setInterval(() => void tick(), 60_000);
  g.__changekiteTicker.unref?.();
  setTimeout(() => void tick(), 5_000).unref?.();
}
