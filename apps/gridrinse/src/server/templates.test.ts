/**
 * Template shop end to end on the real platform (PGlite + FakeStripe with signed webhooks): an anonymous visitor buys a
 * template, Stripe completes it, the webhook records the order once and sends one receipt with the download link, the
 * download page lists signed file links, and the signed links verify (and expire, and resist tampering).
 */
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUNDLE, getTemplate, TEMPLATE_PRODUCTS, TEMPLATES, templateImages, templatesForGuide, templatesForTool } from "@/content/templates";
import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { downloadView, signedFileUrl, templateCheckoutRouteHandler, templateFileRouteHandler, verifyFileLink } from "./templateShop";
import { makeApp, type App } from "./test/harness";
import { existsSync, readdirSync, readFileSync } from "node:fs";

let t = new Date("2026-11-23T10:00:00Z").getTime();
const now = () => new Date(t);
const DAY = 86_400_000;
const SECRET = "test-session-secret-0123456789-abcdefghijklmnop";

const filesDir = mkdtempSync(path.join(tmpdir(), "gr-template-files-"));
let app: App;
beforeAll(async () => {
  // Stand-in files for the local file route (the real paid files live only in private storage).
  for (const tpl of TEMPLATES) {
    for (const f of tpl.files) {
      const p = path.join(filesDir, ...f.key.split("/"));
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, `fake ${f.name}`);
    }
  }
  process.env.TEMPLATE_FILES_DIR = filesDir;
  app = await makeApp({ now });
});
afterAll(async () => {
  delete process.env.TEMPLATE_FILES_DIR;
  await app.close();
});

const checkout = (body: unknown, origin?: string | null) => app.call((p, r) => templateCheckoutRouteHandler(p, r), "/api/templates/checkout", { body, origin });

async function buy(productId: string, email = "buyer@example.test") {
  const r = await checkout({ productId });
  expect(r.status).toBe(200);
  const { url } = (await r.json()) as { url: string };
  const sessionId = url.split("/").pop()!;
  const pi = app.fake.completePassCheckout(sessionId, { email });
  return { sessionId, pi };
}

describe("template catalogue", () => {
  it("every template has data, three private files, images and a sane price; the bundle is cheaper than all", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const tpl of TEMPLATES) {
      expect(tpl.files.map((f) => f.kind).sort()).toEqual(["excel", "gsheets", "guide"]);
      for (const f of tpl.files) expect(f.key).toBe(`t/${tpl.slug}/${f.name}`);
      expect(tpl.priceCents).toBeGreaterThanOrEqual(299);
      expect(tpl.priceCents).toBeLessThanOrEqual(1999);
      expect(tpl.title.length).toBeLessThanOrEqual(65);
      expect(tpl.description.length).toBeGreaterThanOrEqual(110);
      expect(tpl.description.length).toBeLessThanOrEqual(170);
      expect(tpl.features.length).toBeGreaterThanOrEqual(3);
      for (const img of [templateImages(tpl).hero, templateImages(tpl).card, ...templateImages(tpl).gallery]) {
        expect(existsSync(path.join(process.cwd(), "public", img.src)), img.src).toBe(true);
      }
      for (const s of tpl.tools) expect(TOOLS.some((x) => x.slug === s), s).toBe(true);
      for (const s of tpl.guides) expect(GUIDES.some((x) => x.slug === s), s).toBe(true);
    }
    expect(BUNDLE.priceCents).toBeLessThan(TEMPLATES.reduce((n, x) => n + x.priceCents, 0));
    expect(TEMPLATE_PRODUCTS).toHaveLength(TEMPLATES.length + 1);
    expect(new Set(TEMPLATE_PRODUCTS.map((p) => p.stripeLookupKey)).size).toBe(TEMPLATE_PRODUCTS.length);
    expect(templatesForTool("fix-dates-csv").length).toBeGreaterThan(0);
    expect(templatesForGuide("currency-and-number-formats").length).toBeGreaterThan(0);
  });

  it("no paid file is in the repository", () => {
    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "src/content/template-files.json"), "utf8")) as Record<string, { name: string }[]>;
    for (const list of Object.values(manifest)) {
      for (const f of list) expect(existsSync(path.join(process.cwd(), "public", f.name))).toBe(false);
    }
    // Only marketing images under public/templates.
    const pub = path.join(process.cwd(), "public", "templates");
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [e.name]));
    for (const f of walk(pub)) expect(f).toMatch(/\.webp$/);
  });
});

describe("signed file links", () => {
  const file = getTemplate("debt-payoff-planner")!.files[0]!;

  it("verify within 15 minutes, then expire; tampering fails", () => {
    const url = new URL(signedFileUrl(SECRET, file, t), "http://x");
    expect(verifyFileLink(SECRET, url.searchParams, t)).toEqual({ key: file.key, name: file.name });
    expect(verifyFileLink(SECRET, url.searchParams, t + 16 * 60_000)).toBeNull();
    expect(verifyFileLink(SECRET + "x", url.searchParams, t)).toBeNull();
    const other = new URLSearchParams(url.searchParams);
    other.set("k", "t/bundle-hack/Other.xlsx");
    expect(verifyFileLink(SECRET, other, t)).toBeNull();
    const later = new URLSearchParams(url.searchParams);
    later.set("e", String(Number(later.get("e")) + 3600));
    expect(verifyFileLink(SECRET, later, t)).toBeNull();
    const traversal = new URLSearchParams(url.searchParams);
    traversal.set("k", "t/../../etc/passwd.xlsx");
    expect(verifyFileLink(SECRET, traversal, t)).toBeNull();
  });

  it("uses the scheme the Cloudflare Worker checks (HMAC of HMAC(SESSION_SECRET, template-files-v1))", () => {
    const url = new URL(signedFileUrl(SECRET, file, t), "http://x");
    const key = createHmac("sha256", SECRET).update("template-files-v1").digest();
    const q = url.searchParams;
    const want = createHmac("sha256", key).update(`${q.get("k")}\n${q.get("n")}\n${q.get("e")}`).digest("base64url");
    expect(q.get("s")).toBe(want);
  });
});

describe("buying a template (anonymous)", () => {
  it("refuses cross-origin and unknown products", async () => {
    expect((await checkout({ productId: "debt-payoff-planner" }, "https://evil.test")).status).toBe(403);
    expect((await checkout({ productId: "nope" })).status).toBe(400);
  });

  it("checkout -> pay -> webhook: one order, one receipt with the download link, files download", async () => {
    const { sessionId } = await buy("debt-payoff-planner");
    const session = app.fake.sessionsById.get(sessionId)!;
    expect(session.metadata).toEqual({ app: "gridrinse", kind: "product", productId: "debt-payoff-planner" });
    expect(session.success_url).toBe("http://localhost:3102/templates/download?session_id={CHECKOUT_SESSION_ID}");
    expect(session.cancel_url).toBe("http://localhost:3102/templates/debt-payoff-planner");
    expect(session.line_items[0].price_data.unit_amount).toBe(599);

    // Duplicate delivery of the same event: still one order, one receipt.
    const events = app.fake.takeEvents();
    for (const d of [...events, ...events]) {
      const r = await app.call((p, req) => app.routes.webhookRouteHandler(p, req), "/api/billing/webhook", {
        rawBody: d.payload,
        origin: null,
        headers: { "stripe-signature": d.header, "content-type": "application/json" },
      });
      expect(r.status).toBe(200);
    }
    const receipts = app.emails.filter((m) => m.tag === "template_receipt");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.to).toBe("buyer@example.test");
    expect(receipts[0]!.text).toContain(`http://localhost:3102/templates/download?session_id=${sessionId}`);
    expect(receipts[0]!.text).toContain("December 23, 2026");

    const view = await downloadView(app.p, sessionId);
    expect(view.status).toBe("active");
    if (view.status !== "active") return;
    expect(view.templates.map((x) => x.slug)).toEqual(["debt-payoff-planner"]);
    expect(view.templates[0]!.files).toHaveLength(3);
    for (const f of view.templates[0]!.files) {
      const r = await app.call((p, req) => templateFileRouteHandler(p, req), f.url, { origin: null });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-disposition")).toBe(`attachment; filename="${f.name}"`);
      expect(await r.text()).toBe(`fake ${f.name}`);
    }
    // A link without a valid signature is refused.
    const bad = view.templates[0]!.files[0]!.url.replace(/s=[^&]+/, "s=AAAA");
    expect((await app.call((p, req) => templateFileRouteHandler(p, req), bad, { origin: null })).status).toBe(403);
  });

  it("the bundle unlocks every template; the link expires after 30 days; a refund revokes it", async () => {
    const { sessionId, pi } = await buy(BUNDLE.id, "bundle@example.test");
    expect(await app.deliverWebhooks()).toEqual([200]);
    const view = await downloadView(app.p, sessionId);
    expect(view.status === "active" && view.templates.length).toBe(TEMPLATES.length);

    app.fake.refundPayment(pi);
    expect(await app.deliverWebhooks()).toEqual([200]);
    expect((await downloadView(app.p, sessionId)).status).toBe("revoked");

    const second = await buy("wedding-budget-planner");
    await app.deliverWebhooks();
    t += 31 * DAY;
    expect((await downloadView(app.p, second.sessionId)).status).toBe("expired");
  });

  it("the download page verifies with Stripe when it arrives before the webhook; unpaid stays locked", async () => {
    const r = await checkout({ productId: "inventory-tracker" });
    const sessionId = ((await r.json()) as { url: string }).url.split("/").pop()!;
    expect((await downloadView(app.p, sessionId)).status).toBe("unpaid");
    app.fake.completePassCheckout(sessionId, { email: "early@example.test" });
    expect((await downloadView(app.p, sessionId)).status).toBe("active");
    expect(app.emails.filter((m) => m.to === "early@example.test" && m.tag === "template_receipt")).toHaveLength(1);
    expect(await app.deliverWebhooks()).toEqual([200]);
    expect(app.emails.filter((m) => m.to === "early@example.test" && m.tag === "template_receipt")).toHaveLength(1);
    expect((await downloadView(app.p, "cs_test_unknown")).status).toBe("invalid");
    expect((await downloadView(app.p, "nonsense")).status).toBe("invalid");
  });
});
