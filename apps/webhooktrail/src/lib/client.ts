"use client";

import type { ApiErrorDTO } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Extra fields of the API error object (e.g. limit, passAvailable). */
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Same-origin JSON call to our own API (the owner cookie is sent automatically). */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
    signal: init.signal,
  });
  if (!res.ok) {
    let code = "http_error";
    let message = `Request failed (${res.status})`;
    let data: Record<string, unknown> = {};
    try {
      const j = (await res.json()) as ApiErrorDTO;
      data = j.error as unknown as Record<string, unknown>;
      code = j.error.code;
      message = j.error.issues?.length ? j.error.issues.map((i) => `${i.path || "input"}: ${i.message}`).join("; ") : j.error.message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, code, message, data);
  }
  return (await res.json()) as T;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
