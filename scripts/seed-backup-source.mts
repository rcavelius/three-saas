/**
 * Creates and fills a database for the backup/restore drill: full DataPolish migration chain plus real
 * rows written through the application packages (a verified user with a personal org, jobs, incidents,
 * analytics, usage counters).   DATABASE_URL=postgres://.../backup_src npx tsx scripts/seed-backup-source.mts
 */
import { createDb, enqueueJob, rateLimit } from "@repo/database";
import { createAuth, type EmailMessage } from "@repo/auth";
import { createBilling, DATAPOLISH_CATALOG, notConfiguredGateway } from "@repo/billing";
import { raiseIncident, trackEvent } from "@repo/ops";
import { ALL_MIGRATIONS } from "../apps/datapolish/src/server/migrations";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("postgres")) throw new Error("DATABASE_URL must be a postgres:// URL");
const handle = createDb(url, {});
await handle.migrate(ALL_MIGRATIONS);

const emails: EmailMessage[] = [];
const auth = createAuth({
  handle,
  appName: "BackupDrill",
  baseURL: "http://localhost:3998",
  secret: "backup-drill-secret-backup-drill-secret-01",
  cookiePrefix: "bd",
  sendEmail: async (m) => void emails.push(m),
});
for (let i = 0; i < 5; i++) {
  const res = await auth.handler(
    new Request("http://localhost:3998/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3998", "x-forwarded-for": `198.51.100.${i}` },
      body: JSON.stringify({ email: `drill${i}@example.com`, password: "backup drill password", name: `Drill ${i}` }),
    }),
  );
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status}`);
}
const billing = createBilling({ handle, catalog: DATAPOLISH_CATALOG, stripe: notConfiguredGateway(), appUrl: "http://localhost:3998" });
for (let i = 0; i < 20; i++) {
  await enqueueJob(handle.executor, "drill.job", { i });
  await trackEvent(handle.executor, { name: "pageview", path: `/p/${i}`, anonymousId: `anon_${i}aaaaaaaa` });
  await rateLimit(handle.executor, `drill:${i}`, 10, 60_000);
}
await billing.consumeUsage("org_drill", "savedWorkflows", 1).catch(() => undefined);
await raiseIncident(handle.executor, { fingerprint: "drill", severity: "info", source: "drill", title: "Backup drill" });
const { rows } = await handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth_user`);
console.log(`seeded backup source: ${rows[0]!.n} users, ${emails.length} verification emails captured`);
await handle.close();
