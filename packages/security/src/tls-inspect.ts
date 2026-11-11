/**
 * Reads the TLS certificate of an https URL by connecting to the validated, pinned IP with SNI = hostname.
 * Uses rejectUnauthorized:false only to be able to REPORT an invalid certificate; no application data is sent.
 */
import tls from "node:tls";
import { SafeFetchError } from "./errors";
import { assertKnownPolicy, type AddressPolicy } from "./policy";
import { resolvePinnedAddress, systemResolver, type Resolver } from "./resolve";
import { validateTargetUrl } from "./url";

export interface TlsInfo {
  /** Chain trusted AND hostname matches. */
  valid: boolean;
  error?: string;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  protocol?: string | null;
  address: string;
}

export interface InspectTlsOptions {
  timeoutMs?: number;
  resolver?: Resolver;
  policy?: AddressPolicy;
  now?: Date;
}

function pickName(entity: unknown): string | undefined {
  if (!entity || typeof entity !== "object") return undefined;
  const e = entity as Record<string, string | string[] | undefined>;
  const v = e.O ?? e.CN;
  return Array.isArray(v) ? v[0] : v;
}

export async function inspectTls(input: string | URL, options: InspectTlsOptions = {}): Promise<TlsInfo> {
  const policy = assertKnownPolicy(options.policy);
  const target = validateTargetUrl(input, policy);
  if (target.url.protocol !== "https:") throw new SafeFetchError("BLOCKED_SCHEME", "inspectTls needs an https URL");
  const timeoutMs = options.timeoutMs ?? 8_000;
  const address = await resolvePinnedAddress(target, policy, options.resolver ?? systemResolver, timeoutMs);
  const now = options.now ?? new Date();

  return new Promise<TlsInfo>((resolve, reject) => {
    const socket = tls.connect({
      host: address,
      port: target.port,
      servername: target.ipLiteral ? undefined : target.hostname,
      rejectUnauthorized: false,
      ALPNProtocols: ["http/1.1"],
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SafeFetchError("TIMEOUT", "TLS handshake timed out", { url: target.url.href }));
    }, timeoutMs);
    socket.once("error", (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new SafeFetchError("TLS_ERROR", `TLS connection failed: ${(err as NodeJS.ErrnoException).code ?? err.message}`, { url: target.url.href, cause: err }));
    });
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      let error: string | undefined = socket.authorized ? undefined : String(socket.authorizationError ?? "untrusted certificate");
      if (!error && cert && Object.keys(cert).length > 0) {
        const identity = tls.checkServerIdentity(target.hostname, cert);
        if (identity) error = `Hostname mismatch: ${identity.message}`;
      }
      socket.end();
      if (!cert || Object.keys(cert).length === 0) {
        resolve({ valid: false, error: "No certificate presented", address, protocol });
        return;
      }
      const validTo = cert.valid_to ? new Date(cert.valid_to) : undefined;
      resolve({
        valid: !error,
        error,
        issuer: pickName(cert.issuer),
        subject: pickName(cert.subject),
        validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : undefined,
        validTo: validTo?.toISOString(),
        daysRemaining: validTo ? Math.floor((validTo.getTime() - now.getTime()) / 86_400_000) : undefined,
        protocol,
        address,
      });
    });
  });
}
