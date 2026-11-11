export type CappedBody =
  | { kind: "ok"; body: Uint8Array; size: number; truncated: boolean }
  | { kind: "too_large"; size: number };

/**
 * Reads a request body while streaming, keeping at most `storeCap` bytes and aborting as soon as
 * more than `rejectCap` bytes have arrived (the rest is never buffered). A declared Content-Length
 * above `rejectCap` is rejected before reading anything.
 */
export async function readBodyCapped(req: Request, storeCap: number, rejectCap: number): Promise<CappedBody> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim())) {
    const n = Number(declared.trim());
    if (n > rejectCap) {
      await req.body?.cancel().catch(() => undefined);
      return { kind: "too_large", size: n };
    }
  }
  if (!req.body) return { kind: "ok", body: new Uint8Array(0), size: 0, truncated: false };

  const reader = req.body.getReader();
  const kept: Uint8Array[] = [];
  let keptBytes = 0;
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > rejectCap) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too_large", size: total };
      }
      if (keptBytes < storeCap) {
        const room = storeCap - keptBytes;
        const piece = value.byteLength <= room ? value : value.subarray(0, room);
        kept.push(piece);
        keptBytes += piece.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(keptBytes);
  let offset = 0;
  for (const piece of kept) {
    body.set(piece, offset);
    offset += piece.byteLength;
  }
  return { kind: "ok", body, size: total, truncated: total > keptBytes };
}

/** Reads a small body fully (used for JSON API input); returns null if it exceeds maxBytes. */
export async function readSmallText(req: Request, maxBytes: number): Promise<string | null> {
  const r = await readBodyCapped(req, maxBytes, maxBytes);
  if (r.kind === "too_large") return null;
  return new TextDecoder().decode(r.body);
}
