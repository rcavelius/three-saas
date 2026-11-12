/**
 * Read-only operations report from each app's production database: job queue results, schedule runs,
 * scheduler heartbeat, email outbox, analytics events and incidents in the last N hours.
 *   npx tsx scripts/prod-ops-report.mts [hours]
 * Reads DATABASE_URL from .secrets/cloudflare-<app>.json. Prints counts only, no personal data.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const hours = Number(process.argv[2] ?? 3);
for (const app of ["gridrinse", "changekite", "webhooktrail"]) {
  const s = JSON.parse(readFileSync(`.secrets/cloudflare-${app}.json`, "utf8").replace(/^﻿/, ""));
  const db = new pg.Client({ connectionString: s.DATABASE_URL });
  await db.connect();
  const q = async (sql: string) => {
    try {
      return (await db.query(sql, [hours])).rows;
    } catch (e) {
      return [{ error: (e as Error).message.slice(0, 100) }];
    }
  };
  const tables = (await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)).rows.map((r) => r.table_name);
  console.log(`\n== ${app}  (${tables.length} tables)`);
  console.log("jobs by queue/status:", JSON.stringify(await q(`SELECT queue, status, count(*)::int n FROM jobs WHERE created_at > now() - make_interval(hours => $1) GROUP BY 1,2 ORDER BY 1,2`)));
  const schedTable = tables.find((t) => /schedule/.test(t));
  if (schedTable) console.log(`${schedTable}:`, JSON.stringify(await q(`SELECT * FROM ${schedTable} ORDER BY 1 LIMIT 20`)).slice(0, 1500));
  const stateTable = tables.find((t) => /^ops_state$|heartbeat/.test(t));
  if (stateTable) console.log(`${stateTable}:`, JSON.stringify(await q(`SELECT * FROM ${stateTable} LIMIT 20`)).slice(0, 800));
  if (tables.includes("ops_email_outbox")) console.log("email outbox by status:", JSON.stringify(await q(`SELECT status, count(*)::int n FROM ops_email_outbox GROUP BY 1`)));
  const analytics = tables.filter((t) => /analytic|event/.test(t) && !/billing/.test(t));
  for (const t of analytics) console.log(`${t} last ${hours}h:`, JSON.stringify(await q(`SELECT count(*)::int n FROM ${t} WHERE COALESCE(to_jsonb(${t})->>'created_at', to_jsonb(${t})->>'occurred_at', to_jsonb(${t})->>'at', to_jsonb(${t})->>'ts')::timestamptz > now() - make_interval(hours => $1)`)));
  if (tables.includes("incidents")) console.log("incidents:", JSON.stringify(await q(`SELECT key, severity, status, count(*)::int n FROM incidents GROUP BY 1,2,3`)));
  await db.end();
}
