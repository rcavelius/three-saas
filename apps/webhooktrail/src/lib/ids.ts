import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 18 random bytes = 144 bits, base64url = 24 chars. */
export const SLUG_RE = /^[A-Za-z0-9_-]{24}$/;
/** 32 random bytes = 256 bits, base64url = 43 chars. */
export const OWNER_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newSlug(): string {
  return randomBytes(18).toString("base64url");
}

export function newOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time string comparison (hashes both sides first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}
