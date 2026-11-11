/**
 * Address policies decide which resolved IPs and ports may be contacted.
 *
 * Production code never constructs a policy: safeFetch defaults to PUBLIC_ONLY_POLICY. The only other policy is
 * created by `createLoopbackTestPolicy()` in "@repo/security/testing" (a separate package entry point that refuses
 * to run when NODE_ENV=production). safeFetch only accepts policy objects registered here, so a hand-built
 * `{ allowAddress: () => true }` object, or anything parsed from env/query/JSON, is rejected.
 */
import { isLoopbackAddress, isPublicAddress } from "./ip";
import { SafeFetchError } from "./errors";

export interface AddressPolicy {
  readonly name: string;
  allowAddress(ip: string): boolean;
  allowPort(port: number): boolean;
}

const registered = new WeakSet<AddressPolicy>();

function register(p: AddressPolicy): AddressPolicy {
  Object.freeze(p);
  registered.add(p);
  return p;
}

export const PUBLIC_ONLY_POLICY: AddressPolicy = register({
  name: "public-only",
  allowAddress: (ip) => isPublicAddress(ip),
  allowPort: (port) => port === 80 || port === 443,
});

/** @internal Used only by ./testing. Not exported from the package root. */
export function internalCreateLoopbackPolicy(): AddressPolicy {
  return register({
    name: "UNSAFE-test-loopback",
    allowAddress: (ip) => isPublicAddress(ip) || isLoopbackAddress(ip),
    allowPort: (port) => Number.isInteger(port) && port > 0 && port < 65536,
  });
}

export function assertKnownPolicy(policy: AddressPolicy | undefined): AddressPolicy {
  if (policy === undefined) return PUBLIC_ONLY_POLICY;
  if (!registered.has(policy)) {
    throw new SafeFetchError("BLOCKED_POLICY", "Unknown address policy object; only built-in policies are accepted");
  }
  return policy;
}
