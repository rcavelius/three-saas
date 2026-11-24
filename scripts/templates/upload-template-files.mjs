#!/usr/bin/env node
/**
 * Uploads the PAID files of spreadsheet templates (Excel .xlsx, Google Sheets .xlsx, quick-start PDF) to the private
 * Workers KV namespace the gridrinse Worker serves signed downloads from, and rewrites the public manifest
 * apps/gridrinse/src/content/template-files.json (file names, sizes and SHA-256 only; never the files).
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     node scripts/templates/upload-template-files.mjs <products-dir> [slug ...]
 *
 * <products-dir> holds one folder per template in the digital-products layout: <slug>/_build.json names the two
 * workbooks (files.excel, files.gsheets); the guide is the one *-Quick-Start-Guide.pdf in the folder.
 * The paid files must never be committed to this (public) repository.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** gridrinse-template-files (wrangler.gridrinse.jsonc binds it as TEMPLATE_FILES). */
export const KV_NAMESPACE_ID = "e02eb37ac0634cdeac3491e95c3b70bd";
const MAX_BYTES = 20 * 1024 * 1024; // KV values may be up to 25 MiB

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "apps/gridrinse/src/content/template-files.json");

function filesOf(dir, slug) {
  const build = JSON.parse(readFileSync(path.join(dir, "_build.json"), "utf8"));
  const guides = readdirSync(dir).filter((f) => f.endsWith("-Quick-Start-Guide.pdf"));
  if (guides.length !== 1) throw new Error(`${slug}: expected exactly one *-Quick-Start-Guide.pdf, found ${guides.length}`);
  const list = [
    { kind: "excel", name: build.files?.excel },
    { kind: "gsheets", name: build.files?.gsheets },
    { kind: "guide", name: guides[0] },
  ];
  for (const f of list) {
    if (!f.name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,90}\.(xlsx|pdf)$/.test(f.name)) throw new Error(`${slug}: bad file name ${f.name}`);
    if (!existsSync(path.join(dir, f.name))) throw new Error(`${slug}: missing ${f.name}`);
  }
  return list;
}

async function put(key, bytes) {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" }, body: bytes });
    if (res.ok) return;
    const text = (await res.text()).slice(0, 300);
    if (attempt >= 3 || res.status < 500) throw new Error(`KV put ${key} -> ${res.status} ${text}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function main() {
  const [productsDir, ...only] = process.argv.slice(2);
  if (!productsDir) throw new Error("usage: upload-template-files.mjs <products-dir> [slug ...]");
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID");
  const slugs = only.length ? only : readdirSync(productsDir).filter((s) => existsSync(path.join(productsDir, s, "_build.json")));
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  for (const slug of slugs) {
    if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) throw new Error(`bad slug ${slug}`);
    const dir = path.join(productsDir, slug);
    const entries = [];
    for (const f of filesOf(dir, slug)) {
      const bytes = readFileSync(path.join(dir, f.name));
      if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error(`${slug}/${f.name}: size ${bytes.length}`);
      const key = `t/${slug}/${f.name}`;
      await put(key, bytes);
      entries.push({ kind: f.kind, name: f.name, key, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      console.log(`uploaded ${key} (${bytes.length} bytes)`);
    }
    manifest[slug] = entries;
  }
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  writeFileSync(manifestPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`manifest: ${path.relative(root, manifestPath)} (${Object.keys(sorted).length} templates)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
