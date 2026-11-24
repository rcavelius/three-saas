/**
 * Template shop (/templates): one-time Stripe Checkout per template (or the bundle), then downloads.
 *
 * Flow: POST /api/templates/checkout {productId} -> Stripe Checkout -> /templates/download?session_id=cs_...
 * The download page verifies the order (billing.claimOrder: our database, else Stripe), and lists the files with
 * short-lived signed links /api/templates/file?k=&n=&e=&s=. In production the Cloudflare Worker answers those links
 * itself from the private KV namespace (deploy/cloudflare/src/index.ts, same signature); the route below is the
 * fallback for local runs and CI, serving from TEMPLATE_FILES_DIR. The paid files never live in this repository.
 *
 * The signing key is derived from SESSION_SECRET (HMAC-SHA256(SESSION_SECRET, "template-files-v1")), which the Worker
 * holds too, so no new secret is needed.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isBillingError, type Order, type OrderClaim } from "@repo/billing";
import { renderBrandedEmail, type Brand } from "@repo/ops";
import type { EmailMessage } from "@repo/auth";
import { ACCESS_DAYS, BUNDLE, getTemplate, priceLabel, TEMPLATES, templatesForProduct, type TemplateFile } from "@/content/templates";
import { guarded, json, limitByIp } from "./http";
import type { Platform } from "./platform";

const MINUTE = 60_000;
/** Signed file links work this long; the download page makes fresh ones on every visit. */
export const FILE_LINK_SECONDS = 15 * 60;
export const DOWNLOAD_PATH = "/templates/download";

export function fileSigningKey(sessionSecret: string): Buffer {
  return createHmac("sha256", sessionSecret).update("template-files-v1").digest();
}

function fileSig(key: Buffer, k: string, n: string, e: number): string {
  return createHmac("sha256", key).update(`${k}\n${n}\n${e}`).digest("base64url");
}

/** A same-origin signed link for one file (k = storage key, n = download file name). */
export function signedFileUrl(sessionSecret: string, file: Pick<TemplateFile, "key" | "name">, nowMs: number, ttlSeconds = FILE_LINK_SECONDS): string {
  const e = Math.floor(nowMs / 1000) + ttlSeconds;
  const s = fileSig(fileSigningKey(sessionSecret), file.key, file.name, e);
  const q = new URLSearchParams({ k: file.key, n: file.name, e: String(e), s });
  return `/api/templates/file?${q.toString()}`;
}

const KEY_RE = /^t\/[a-z0-9-]{1,60}\/[A-Za-z0-9][A-Za-z0-9._-]{0,90}\.(xlsx|pdf)$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,90}\.(xlsx|pdf)$/;

/** Checks a signed file link; returns the storage key and file name, or null. */
export function verifyFileLink(sessionSecret: string, params: URLSearchParams, nowMs: number): { key: string; name: string } | null {
  const k = params.get("k") ?? "";
  const n = params.get("n") ?? "";
  const e = Number(params.get("e"));
  const s = params.get("s") ?? "";
  if (!KEY_RE.test(k) || !NAME_RE.test(n) || !Number.isSafeInteger(e) || s.length > 100) return null;
  if (e * 1000 < nowMs) return null;
  const want = Buffer.from(fileSig(fileSigningKey(sessionSecret), k, n, e));
  const got = Buffer.from(s);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return { key: k, name: n };
}

export function contentTypeOf(name: string): string {
  return name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

export function downloadUrl(appUrl: string, orderId: string): string {
  return `${appUrl}${DOWNLOAD_PATH}?session_id=${encodeURIComponent(orderId)}`;
}

const dateLabel = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** The buyer's receipt with the re-download link (sent once per order, through the outbox mailer). */
export function templateReceiptEmail(brand: Brand, order: Order): EmailMessage | null {
  if (!order.email) return null;
  const templates = templatesForProduct(order.productId);
  const url = downloadUrl(brand.url, order.id);
  const what = order.productId === BUNDLE.id ? `all ${templates.length} spreadsheet templates` : `the ${templates[0]?.name ?? order.name}`;
  const { html, text } = renderBrandedEmail(brand, {
    heading: "Your templates are ready to download",
    paragraphs: [
      `Thank you for buying ${what}. Each template comes as an Excel workbook, a Google-Sheets-ready workbook and a quick-start PDF guide.`,
      `Your download link works until ${dateLabel(order.accessUntil)} (UTC). Keep this email: the same link works on any device. Save the files somewhere safe; once downloaded they are yours to keep.`,
      `Stripe sends a separate payment receipt. Questions or a file that does not open? Reply to this email or write to ${brand.supportEmail ?? "support"}.`,
    ],
    action: { label: "Download your templates", url },
  });
  return { to: order.email, subject: `Your ${brand.name} download: ${what}`, html, text, tag: "template_receipt" } as EmailMessage;
}

// ------------------------------------------------------------------------------------------------
// Routes

/** POST (form or JSON) { productId } -> 303 to Stripe Checkout. Anonymous buyers welcome. */
export async function templateCheckoutRouteHandler(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    await limitByIp(p.handle.executor, p.env.clientIp, req, "template-checkout", 20, MINUTE, p.now());
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    const origin = req.headers.get("origin");
    if (origin ? origin !== p.env.appUrl : req.headers.get("sec-fetch-site") !== "same-origin") return json(403, { error: "cross_origin" });
    const form = (req.headers.get("content-type") ?? "").includes("form");
    let productId: unknown;
    try {
      productId = form ? (await req.formData()).get("productId") : ((await req.json()) as { productId?: unknown } | null)?.productId;
    } catch {
      return json(400, { error: "invalid_body" });
    }
    const id = typeof productId === "string" ? productId : "";
    const back = id === BUNDLE.id ? "/templates" : getTemplate(id) ? `/templates/${id}` : "/templates";
    if (!p.billing.products.some((x) => x.id === id)) return json(400, { error: "unknown_product" });
    const fail = (message: string, status: number) =>
      form
        ? new Response(null, { status: 303, headers: { location: `${back}?checkout=unavailable`, "cache-control": "no-store" } })
        : json(status, { error: "checkout_unavailable", message });
    if (!p.billingConfigured) return fail("Payments are not switched on yet. Nothing is charged.", 503);
    let url: string;
    try {
      ({ url } = await p.billing.createProductCheckout(id, { successPath: `${DOWNLOAD_PATH}?session_id={CHECKOUT_SESSION_ID}`, cancelPath: back }));
    } catch (e) {
      p.logger.error("template checkout failed", { productId: id, error: e instanceof Error ? e.message : String(e) });
      if (isBillingError(e) && e.status < 500) return json(e.status, { error: e.code });
      return fail("Checkout is not available right now. Nothing was charged.", 503);
    }
    return form ? new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } }) : json(200, { url });
  });
}

/**
 * GET signed file link. Production: the Worker serves it from KV before the request reaches the app. Here: serve from
 * TEMPLATE_FILES_DIR (local runs, CI e2e) after the same signature check, else 404.
 */
export async function templateFileRouteHandler(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    await limitByIp(p.handle.executor, p.env.clientIp, req, "template-file", 60, MINUTE, p.now());
    const link = verifyFileLink(p.env.sessionSecret, new URL(req.url).searchParams, p.now().getTime());
    if (!link) return json(403, { error: "link_invalid_or_expired", message: "This download link has expired. Open your download page again for a fresh one." });
    const dir = process.env.TEMPLATE_FILES_DIR;
    if (!dir) return json(404, { error: "not_found" });
    let bytes: Buffer;
    try {
      // KEY_RE allows no "..", no backslashes and no absolute paths.
      bytes = await readFile(path.join(path.resolve(dir), ...link.key.split("/")));
    } catch {
      return json(404, { error: "not_found" });
    }
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": contentTypeOf(link.name),
        "content-disposition": `attachment; filename="${link.name}"`,
        "content-length": String(bytes.length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-template-sha256": createHash("sha256").update(bytes).digest("hex"),
      },
    });
  });
}

// ------------------------------------------------------------------------------------------------
// Download page data

export type DownloadView =
  | { status: "active"; order: Order; accessUntil: string; templates: { slug: string; name: string; files: { name: string; kind: TemplateFile["kind"]; bytes: number; url: string }[] }[] }
  | { status: "expired" | "revoked" | "unpaid" | "invalid" | "error"; order?: Order };

export async function downloadView(p: Platform, sessionId: string): Promise<DownloadView> {
  let claim: OrderClaim;
  try {
    claim = await p.billing.claimOrder(sessionId);
  } catch (e) {
    p.logger.error("template claim failed", { error: e instanceof Error ? e.message : String(e) });
    return { status: "error" };
  }
  if (!("order" in claim)) return { status: claim.status };
  const order = claim.order;
  if (claim.status !== "active") return { status: claim.status, order };
  const now = p.now().getTime();
  return {
    status: "active",
    order,
    accessUntil: order.accessUntil.toISOString(),
    templates: templatesForProduct(order.productId).map((t) => ({
      slug: t.slug,
      name: t.name,
      files: t.files.map((f) => ({ name: f.name, kind: f.kind, bytes: f.bytes, url: signedFileUrl(p.env.sessionSecret, f, now) })),
    })),
  };
}

export const shopFacts = {
  accessDays: ACCESS_DAYS,
  templateCount: TEMPLATES.length,
  bundlePrice: priceLabel(BUNDLE.priceCents),
};
