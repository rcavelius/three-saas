#!/usr/bin/env node
/**
 * Writes small stand-in files for every template file in apps/gridrinse/src/content/template-files.json into <dir>
 * (layout t/<slug>/<file>), for TEMPLATE_FILES_DIR in local runs and the CI checkout e2e. The real paid files live
 * only in private storage and are never in this repository.
 *
 *   node scripts/templates/stand-in-files.mjs <dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2];
if (!dir) throw new Error("usage: stand-in-files.mjs <dir>");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "apps/gridrinse/src/content/template-files.json"), "utf8"));
let n = 0;
for (const files of Object.values(manifest)) {
  for (const f of files) {
    const p = path.join(dir, ...f.key.split("/"));
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, `checkout e2e stand-in for ${f.name}\n`);
    n++;
  }
}
console.log(`${n} stand-in files in ${dir}`);
