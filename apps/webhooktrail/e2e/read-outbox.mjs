// Smoke-test helper: prints the newest link containing <pathPart> from emails to <to> in a PGlite data dir.
// Run only while the server is STOPPED (PGlite is single-process).  node e2e/read-outbox.mjs <dataDir> <to> <pathPart>
import { PGlite } from "@electric-sql/pglite";

const [dataDir, to, pathPart] = process.argv.slice(2);
const db = new PGlite(dataDir);
const { rows } = await db.query(
  `SELECT text_body FROM ops_email_outbox WHERE to_address = $1 ORDER BY created_at DESC LIMIT 10`,
  [to],
);
await db.close();
for (const r of rows) {
  const m = (r.text_body.match(/https?:\/\/[^\s<>"]+/g) ?? []).find((u) => u.includes(pathPart));
  if (m) {
    process.stdout.write(m);
    process.exit(0);
  }
}
process.stderr.write("no link found\n");
process.exit(1);
