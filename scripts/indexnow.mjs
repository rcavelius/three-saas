// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver...) about every URL in GridRinse's sitemap.
// No account needed: ownership is proven by the key file served at https://gridrinse.com/<key>.txt.
// Run after a deploy that adds or changes pages:  node scripts/indexnow.mjs
const HOST = "gridrinse.com";
const KEY = "4d1200f2d7185fb775f5b86c6065a2ef";

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
console.log(`IndexNow: submitted ${urls.length} URLs -> HTTP ${res.status} ${res.status === 200 || res.status === 202 ? "(accepted)" : await res.text()}`);
