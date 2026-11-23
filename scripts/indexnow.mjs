// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver...) about every URL in a product's sitemap.
// No account needed: ownership is proven by the key file served at https://<domain>/<key>.txt
// (apps/<app>/public/<key>.txt).
// Run after a deploy that adds or changes pages:
//   node scripts/indexnow.mjs                 (GridRinse)
//   node scripts/indexnow.mjs changekite
//   node scripts/indexnow.mjs webhooktrail
const KEYS = {
  gridrinse: "4d1200f2d7185fb775f5b86c6065a2ef",
  changekite: "f2f88dd2ab8fc2dec2cb0bcb9e25ddf5",
  webhooktrail: "6ea024541ac67545cbf9c2a4954e8ff4",
};
const app = process.argv[2] ?? "gridrinse";
const KEY = KEYS[app];
if (!KEY) {
  console.error(`Unknown app "${app}" (expected one of ${Object.keys(KEYS).join(", ")})`);
  process.exit(1);
}
const HOST = `${app}.com`;

const keyRes = await fetch(`https://${HOST}/${KEY}.txt`);
if (!keyRes.ok || (await keyRes.text()).trim() !== KEY) {
  console.error(`Key file https://${HOST}/${KEY}.txt is not live yet (status ${keyRes.status}); deploy first.`);
  process.exit(1);
}
const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow ${HOST}: submitted ${urls.length} URLs -> HTTP ${res.status} ${res.status === 200 || res.status === 202 ? "(accepted)" : await res.text()}`);
