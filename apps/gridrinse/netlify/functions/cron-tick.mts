/**
 * Netlify Scheduled Function: drives the Postgres job queue (scheduled maintenance, email outbox, billing
 * reconciliation, cleanup, owner alerts) by calling the app's own /api/cron/tick with the cron secret.
 * Scheduled functions only run on the published production deploy of the site.
 */
export default async (): Promise<Response> => {
  const base = process.env.URL ?? process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("cron-tick: URL/APP_URL or CRON_SECRET missing; nothing scheduled");
    return new Response("not configured", { status: 500 });
  }
  const res = await fetch(new URL("/api/cron/tick", base), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  });
  const body = await res.text();
  console.log(`cron-tick: ${res.status} ${body.slice(0, 300)}`);
  return new Response(null, { status: res.ok ? 204 : 502 });
};

export const config = { schedule: "*/5 * * * *" };
