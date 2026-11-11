export type AuthErrorStatus = 401 | 403 | 404;

/**
 * Thrown by the server helpers (requireUser / requireOrg / orgScope).
 * 401 = not signed in, 403 = signed in but not allowed, 404 = resource (org) not visible to this user.
 * Route handlers map it to a response with `toResponse()`; never leak more detail than `message`.
 */
export class AuthError extends Error {
  readonly status: AuthErrorStatus;
  readonly code: string;

  constructor(status: AuthErrorStatus, code: string, message?: string) {
    super(message ?? defaultMessage(status));
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }

  toResponse(): Response {
    return new Response(JSON.stringify({ error: this.code, message: this.message }), {
      status: this.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

function defaultMessage(status: AuthErrorStatus): string {
  if (status === 401) return "Sign in required";
  if (status === 403) return "You do not have permission to do that";
  return "Not found";
}

/**
 * Shape check, not `instanceof`: Next.js can bundle this package into several server chunks, each with its own
 * AuthError class, so an error thrown in one chunk fails `instanceof` in another.
 */
export function isAuthError(err: unknown): err is AuthError {
  if (err instanceof AuthError) return true;
  const e = err as { name?: unknown; status?: unknown; code?: unknown } | null;
  return (
    !!e &&
    typeof e === "object" &&
    e.name === "AuthError" &&
    (e.status === 401 || e.status === 403 || e.status === 404) &&
    typeof e.code === "string"
  );
}
