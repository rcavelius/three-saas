import type { SqlExecutor } from "@repo/database";
import type { Logger } from "@repo/monitoring";

export type { SqlExecutor };

/** Injected wall clock. Every time-dependent function takes one so tests are deterministic. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type Severity = "info" | "warning" | "critical";

/** Per-app branding used by every email this package renders. */
export interface Brand {
  /** Product name shown in emails, e.g. "SiteProof". */
  name: string;
  /** Public base URL of the app (https://...). */
  url: string;
  /** Accent colour as #rgb or #rrggbb. Anything else falls back to a neutral blue. */
  primaryColor?: string;
  /** Optional support address shown in the footer. */
  supportEmail?: string;
  /** Optional postal address line for the footer (CAN-SPAM style). */
  postalAddress?: string;
}

/** Same shape as @repo/auth's EmailMessage so auth can hand messages straight to the mailer. */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  tag: string;
}

export interface JobContext {
  jobId: string;
  queue: string;
  attempt: number;
  maxAttempts: number;
  /** True when a failure of this run will dead-letter the job. */
  isFinalAttempt: boolean;
  now: Date;
  logger: Logger;
}

export type JobHandler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void>;

/**
 * Throw from a job handler when retrying cannot help (e.g. HTTP 4xx from a provider).
 * The scheduler dead-letters the job immediately instead of backing off.
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/** A null logger for callers that do not pass one. */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};
