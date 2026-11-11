export type SafeFetchErrorCode =
  | "INVALID_URL"
  | "BLOCKED_SCHEME"
  | "BLOCKED_PORT"
  | "BLOCKED_CREDENTIALS"
  | "BLOCKED_HOST"
  | "BLOCKED_ADDRESS"
  | "BLOCKED_METHOD"
  | "BLOCKED_POLICY"
  | "DNS_FAILURE"
  | "TOO_MANY_REDIRECTS"
  | "TIMEOUT"
  | "BODY_TOO_LARGE"
  | "TLS_ERROR"
  | "NETWORK";

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;
  readonly url?: string;
  constructor(code: SafeFetchErrorCode, message: string, opts: { url?: string; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "SafeFetchError";
    this.code = code;
    this.url = opts.url;
  }

  /** True for errors that mean "we refused to fetch this" rather than "the site failed". */
  get isBlocked(): boolean {
    return this.code.startsWith("BLOCKED_") || this.code === "INVALID_URL";
  }
}
