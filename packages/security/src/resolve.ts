import { lookup } from "node:dns/promises";
import { SafeFetchError } from "./errors";
import { parseIp } from "./ip";
import type { AddressPolicy } from "./policy";
import type { ValidatedUrl } from "./url";

/** Returns every address for a hostname. Injected in tests. */
export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

/**
 * Resolves the target and checks EVERY address against the policy (one bad record = reject; a host that answers
 * with both public and private records is a classic rebinding setup). Returns the address to pin the socket to.
 */
export async function resolvePinnedAddress(
  target: ValidatedUrl,
  policy: AddressPolicy,
  resolver: Resolver,
  timeoutMs: number,
): Promise<string> {
  if (target.ipLiteral) return target.ipLiteral;
  let addresses: string[];
  let timer: NodeJS.Timeout | undefined;
  try {
    addresses = await Promise.race([
      resolver(target.hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SafeFetchError("TIMEOUT", "DNS lookup timed out")), timeoutMs);
      }),
    ]);
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    throw new SafeFetchError("DNS_FAILURE", `Could not resolve ${target.hostname}`, { url: target.url.href, cause: err });
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new SafeFetchError("DNS_FAILURE", `No addresses for ${target.hostname}`, { url: target.url.href });
  }
  for (const a of addresses) {
    if (!parseIp(a) || !policy.allowAddress(a)) {
      throw new SafeFetchError("BLOCKED_ADDRESS", `${target.hostname} resolves to a non-public address`, {
        url: target.url.href,
      });
    }
  }
  return addresses[0]!;
}
