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
  createdAt: string;
  expiresAt: string;
  expired: boolean;
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
    retentionHours: number;
    maxExpiresAt: string;
  };
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
  requests: RequestSummaryDTO[];
  /** Pass as ?before= to load older requests; null when there are no more. */
  nextCursor: string | null;
}

export interface ApiErrorDTO {
  error: { code: string; message: string; issues?: { path: string; message: string }[]; retryAfterSeconds?: number };
}
