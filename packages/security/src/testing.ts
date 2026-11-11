/**
 * TEST-ONLY helpers. Imported as "@repo/security/testing"; never from application code.
 * The loopback policy lets tests reach a node:http fixture on 127.0.0.1 on any port.
 */
import { internalCreateLoopbackPolicy, type AddressPolicy } from "./policy";
import type { Resolver } from "./resolve";

export function createLoopbackTestPolicy(): AddressPolicy {
  if (process.env.NODE_ENV === "production") {
    throw new Error("createLoopbackTestPolicy() must never be used in production");
  }
  return internalCreateLoopbackPolicy();
}

/** Resolver backed by a fixed table; unknown hosts fail like NXDOMAIN. */
export function staticResolver(table: Record<string, string[] | (() => string[])>): Resolver {
  return async (hostname) => {
    const entry = table[hostname.toLowerCase()];
    if (!entry) {
      const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    }
    return typeof entry === "function" ? entry() : entry;
  };
}
