/** JSON shapes returned by the inspection API (shared by server and browser code). */
export const CAPTURE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

export const RESPONSE_CONTENT_TYPES = ["application/json", "text/plain"] as const;
export type ResponseContentType = (typeof RESPONSE_CONTENT_TYPES)[number];

export interface EndpointDTO {
  id: string;
  slug: string;
  name: string;
  captureUrl: string;
  plan: string;
  planName: string;
  /** "org" = belongs to the signed-in user's workspace; "anonymous" = owner-token cookie of this browser. */
  owner: "org" | "anonymous";
  createdAt: string;
  /** null = never expires (paid plans). */
  expiresAt: string | null;
  expired: boolean;
  /** Paused because the workspace's plan no longer covers it (capture answers 423). */
  locked: boolean;
  /** Requests kept (newest); older ones are pruned. */
  maxRequests: number;
  /** Requests received over the endpoint's lifetime (including pruned ones). */
  requestCount: number;
  /** Requests currently stored. */
  storedCount: number;
  lastRequestAt: string | null;
  response: {
    status: number;
    contentType: ResponseContentType;
    /** null = default body {"ok":true,"id":"<request id>"} */
    body: string | null;
  };
  limits: {
    storedBodyBytes: number;
    maxBodyBytes: number;
    requestsPerMonth: number;
    historyDays: number;
    /** null for endpoints that never expire. */
    ttlHours: number | null;
    maxExpiresAt: string | null;
  };
  permissions: {
    canDelete: boolean;
    canReplay: boolean;
    /** The owner's plan or an active pass includes replay (replay itself still needs a workspace). */
    replayIncluded: boolean;
    canManageDestinations: boolean;
  };
}

/** The one-time pass as shown on paywalls and the pricing page (values from the billing catalog). */
export interface PassOffer {
  passId: string;
  name: string;
  /** e.g. "$5" */
  price: string;
  /** e.g. "7 days" */
  durationLabel: string;
  endpoints: string;
  lifetimeDays: number;
  historyDays: number;
  requestsStored: string;
  developerName: string;
  developerPrice: string;
}

/** The viewer's active pass (API responses). unlockPath is the reusable unlock link, only for its holder. */
export interface PassStatusDTO {
  name: string;
  expiresAt: string;
  unlockPath: string | null;
}

export interface DestinationDTO {
  id: string;
  name: string;
  url: string;
  verified: boolean;
  verifiedAt: string | null;
  lastVerificationError: string | null;
  verificationAttemptedAt: string | null;
  createdAt: string;
}

export type ReplayStatus = "scheduled" | "running" | "delivered" | "failed" | "blocked" | "skipped";

export interface ReplayDTO {
  id: string;
  batchId: string;
  requestId: string | null;
  destinationId: string | null;
  destinationUrl: string;
  by: string | null;
  attempt: number;
  attemptsTotal: number;
  status: ReplayStatus;
  responseStatus: number | null;
  elapsedMs: number | null;
  errorCode: string | null;
  error: string | null;
  responseBodyPreview: string | null;
  responseTruncated: boolean;
  includedSensitive: string[];
  runAt: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface RequestSummaryDTO {
  id: string;
  cursor: string;
  method: string;
  path: string;
  query: string;
  contentType: string | null;
  bodySize: number;
  truncated: boolean;
  sourceIp: string | null;
  receivedAt: string;
}

export interface RequestDetailDTO extends RequestSummaryDTO {
  headers: [string, string][];
  /** Stored (possibly truncated) body, base64. */
  bodyBase64: string;
  storedBodySize: number;
}

export interface RequestListDTO {
  /** Newest first. */
  requests: RequestSummaryDTO[];
  /** Pass as ?before= to load older requests; null when there are no more (or in ?after= mode). */
  nextCursor: string | null;
  /**
   * ?after= mode only: true when more new requests exist beyond this page. The page holds the
   * OLDEST requests after the cursor, so polling again with after=<newest cursor of this page>
   * catches up without gaps.
   */
  hasMore?: boolean;
}

export interface ApiErrorDTO {
  error: { code: string; message: string; issues?: { path: string; message: string }[]; retryAfterSeconds?: number };
}
