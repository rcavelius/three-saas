// CI dependency audit: fails on any high or critical advisory, except the documented exceptions below.
// Each exception names the advisory, why it does not reach production, and a date after which CI fails
// again so it is reviewed. Run: node scripts/audit.mjs
import { execSync } from "node:child_process";

const EXCEPTIONS = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    reason:
      "ReDoS in glob matching. picomatch is only reached through the test runner (vitest -> vite/tinyglobby), " +
      "which better-auth lists as an optional peer for its test helpers. It never runs in the deployed apps and " +
      "only ever matches our own test-file globs. No fixed picomatch release exists yet.",
    until: "2027-01-31",
  },
];

let raw;
try {
  raw = execSync("npm audit --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
}
const report = JSON.parse(raw);
const today = new Date().toISOString().slice(0, 10);
const active = new Map(EXCEPTIONS.filter((x) => x.until >= today).map((x) => [x.id, x]));
for (const x of EXCEPTIONS) if (x.until < today) console.log(`Exception for ${x.id} expired on ${x.until}: review it.`);

const advisoryIds = (v) =>
  v.via.filter((x) => typeof x === "object").map((x) => (x.url ?? "").split("/").pop());

/** True when every advisory behind this entry (followed through `via` package names) is an active exception. */
function excused(name, seen = new Set()) {
  if (seen.has(name)) return true;
  seen.add(name);
  const v = report.vulnerabilities[name];
  if (!v) return true;
  return v.via.every((x) => (typeof x === "object" ? active.has((x.url ?? "").split("/").pop()) : excused(x, seen)));
}

const failing = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (v.severity !== "high" && v.severity !== "critical") continue;
  if (excused(name)) {
    const ids = advisoryIds(v);
    console.log(`allowed: ${name} (${v.severity})${ids.length ? ` ${ids.join(", ")}` : " via " + v.via.join(", ")}`);
    continue;
  }
  failing.push(`${name} (${v.severity})`);
}
if (failing.length) {
  console.error(`High/critical advisories without an exception:\n  ${failing.join("\n  ")}\nRun npm audit for details.`);
  process.exit(1);
}
console.log("Dependency audit passed (no high or critical advisories outside documented exceptions).");
