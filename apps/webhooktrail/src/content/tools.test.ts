import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { WEBHOOKTRAIL_CATALOG } from "@repo/billing";
import { GUIDES } from "@/app/guides/guides";
import { captureResponseHeaders } from "@/lib/capture";
import { formatCount, limits } from "@/lib/plans";
import { isSensitiveHeader } from "@/lib/sensitive";
import { CAPTURE_METHODS } from "@/lib/types";
import { customResponseSchema } from "@/lib/validation";
import { REPLAY_PLANS, TOOLS, freePlanFacts, paidPlanFacts, replayFromPrice, replayPlanNames } from "./tools";

vi.mock("@/lib/platform", () => ({
  getPlatform: async () => ({ support: { articleSlugs: async () => [] } }),
}));

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const pageText = (t: (typeof TOOLS)[number]) => [t.title, t.h1, t.description, t.intro, ...t.howTo, ...t.faq.flatMap((f) => [f.q, f.a])].join("\n");
const free = WEBHOOKTRAIL_CATALOG.plans.find((p) => p.id === WEBHOOKTRAIL_CATALOG.freePlanId)!;

describe("tool landing pages", () => {
  it("have unique slugs and search-sized titles and descriptions", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(8);
    expect(TOOLS.length).toBeLessThanOrEqual(14);
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.title)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.title.length).toBeLessThanOrEqual(70);
      expect(t.description.length, t.slug).toBeGreaterThan(80);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(170);
      expect(t.howTo.length).toBeGreaterThanOrEqual(3);
      expect(t.faq.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("quote only prices that exist in WEBHOOKTRAIL_CATALOG", () => {
    const prices = new Set([
      ...WEBHOOKTRAIL_CATALOG.plans.map((p) => `$${p.priceMonthlyCents / 100}`),
      ...(WEBHOOKTRAIL_CATALOG.passes ?? []).map((p) => `$${p.priceCents / 100}`),
    ]);
    for (const t of TOOLS) {
      for (const m of pageText(t).match(/\$\d+(?:\.\d+)?/g) ?? []) expect(prices, `${t.slug}: ${m}`).toContain(m);
    }
  });

  it("render plan numbers from the catalog", () => {
    expect(freePlanFacts).toContain(`up to ${formatCount(free.limits.endpoints!)} endpoints`);
    expect(freePlanFacts).toContain(`${formatCount(free.limits.requestsPerMonth!)} captured requests a month`);
    expect(freePlanFacts).toContain(`newest ${formatCount(free.limits.requestsStored!)} requests`);
    for (const p of WEBHOOKTRAIL_CATALOG.plans.filter((x) => x.priceMonthlyCents > 0)) {
      expect(paidPlanFacts).toContain(`${p.name} ($${p.priceMonthlyCents / 100}/month)`);
      expect(paidPlanFacts).toContain(`${formatCount(p.limits.requestsPerMonth!)} requests a month`);
    }
  });

  it("only promise replay on plans whose catalog `replay` feature is on", () => {
    expect(free.features.replay).toBe(false);
    const withReplay = WEBHOOKTRAIL_CATALOG.plans.filter((p) => p.features.replay).map((p) => p.name);
    expect(REPLAY_PLANS.map((p) => p.def.name)).toEqual(withReplay);
    expect(withReplay.length).toBeGreaterThan(0);
    for (const n of withReplay) expect(replayPlanNames).toContain(n);
    expect(replayPlanNames).not.toContain(free.name);
    const cheapest = Math.min(...WEBHOOKTRAIL_CATALOG.plans.filter((p) => p.features.replay).map((p) => p.priceMonthlyCents));
    expect(replayFromPrice).toBe(`$${cheapest / 100}/month`);
    const replay = TOOLS.find((t) => t.slug === "replay-webhook")!;
    expect(replay.feature).toBe("replay");
    expect(replay.description).toContain(replayPlanNames);
    // The replay UI and the per-plan gate exist.
    expect(src("../components/inspector/ReplayPanel.tsx")).toContain("Replay once");
    expect(src("../lib/plans.ts")).toContain("replay: Boolean(features.replay)");
  });

  it("custom responses exist on every plan with the promised options", () => {
    expect(TOOLS.some((t) => t.feature === "customResponses")).toBe(true);
    for (const p of WEBHOOKTRAIL_CATALOG.plans) expect(p.features.customResponses, p.id).toBe(true);
    expect(customResponseSchema.safeParse({ status: 500, contentType: "application/json", body: '{"error":"down"}' }).success).toBe(true);
    expect(customResponseSchema.safeParse({ status: 503, contentType: "text/plain", body: "busy" }).success).toBe(true);
    expect(customResponseSchema.safeParse({ status: 199, contentType: "text/plain", body: "" }).success).toBe(false);
    expect(customResponseSchema.safeParse({ status: 200, contentType: "text/html", body: "<b>" }).success).toBe(false);
    expect(customResponseSchema.safeParse({ status: 204, contentType: "text/plain", body: "x" }).success).toBe(false);
    expect(limits.responseBodyMaxBytes).toBe(4096);
    const settings = src("../components/inspector/EndpointSettings.tsx");
    expect(settings).toContain("Save response");
    expect(settings).toContain("Reset to default");
  });

  it("inspector features named on the pages exist", () => {
    const body = src("../components/inspector/BodyViewer.tsx");
    for (const label of ['label: "Raw"', 'label: "Hex"', '"JSON tree"', '"Form fields"']) expect(body).toContain(label);
    expect(body).toContain("hidden while secrets are masked");
    expect(src("../components/inspector/RequestDetail.tsx")).toContain("Copy as cURL");
    expect(isSensitiveHeader("stripe-signature")).toBe(true);
    expect(isSensitiveHeader("x-hub-signature-256")).toBe(true);
    expect([...CAPTURE_METHODS]).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
    expect(captureResponseHeaders("application/json").get("access-control-allow-origin")).toBe("*");
  });

  it("test payload samples named on the page exist", () => {
    const payloads = src("../components/inspector/TestPayloads.tsx");
    for (const s of ["JSON event", "Form post", "Plain text", "Oversized payload (1.1 MB)", "Malformed JSON", "Send a test payload"]) {
      expect(payloads).toContain(s);
    }
    expect(payloads).toContain(".repeat(1_150_000)");
  });

  it("provider pages stay honest about signatures, masking and static responses", () => {
    const twilio = TOOLS.find((t) => t.slug === "twilio-webhook-tester")!;
    const slack = TOOLS.find((t) => t.slug === "slack-webhook-tester")!;
    expect(isSensitiveHeader("x-twilio-signature")).toBe(true);
    expect(isSensitiveHeader("x-slack-signature")).toBe(true);
    expect(src("../components/inspector/BodyViewer.tsx")).toContain('"Form fields"');
    for (const t of [twilio, slack]) expect(t.faq.some((f) => f.a.includes("does not check signatures"))).toBe(true);
    expect(pageText(slack)).toContain(String(limits.responseBodyMaxBytes));
  });

  it("never claim forwarding to localhost or automatic forwarding", () => {
    for (const t of TOOLS) {
      const text = pageText(t).toLowerCase();
      expect(text, t.slug).not.toMatch(/forwards? (every|each|all|incoming)|auto-?forward|to localhost (works|is supported)/);
    }
  });

  it("link only to guides, help articles and docs sections that exist", () => {
    const docs = src("../app/docs/page.tsx");
    for (const t of TOOLS) {
      for (const l of t.links) {
        if (l.href.startsWith("/guides/")) expect(GUIDES.map((g) => `/guides/${g.slug}`), l.href).toContain(l.href);
        else if (l.href.startsWith("/help/")) {
          const slug = l.href.slice("/help/".length);
          expect(existsSync(fileURLToPath(new URL(`../../content/help/${slug}.md`, import.meta.url))), l.href).toBe(true);
        } else if (l.href.startsWith("/docs#")) expect(docs, l.href).toContain(`id="${l.href.slice("/docs#".length)}"`);
        else throw new Error(`unexpected link ${l.href}`);
      }
    }
  });

  it("are all in the sitemap, with /tools", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).toContain("/tools");
    for (const t of TOOLS) expect(urls).toContain(`/tools/${t.slug}`);
  });
});
