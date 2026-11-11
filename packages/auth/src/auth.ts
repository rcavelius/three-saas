/**
 * createAuth: the one Better Auth configuration shared by ChangeKite, DataPolish and WebhookTrail.
 *
 * All crypto (password hashing, token generation, cookie signing, session storage) is Better Auth's.
 * This module only wires options, table names, emails, tenancy hooks and server helpers.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";
import type { DbHandle, SqlExecutor } from "@repo/database";
import { authSchema } from "./schema";
import { AuthError } from "./errors";
import { defaultEmailTemplates, type AuthEmailTemplates, type EmailMessage } from "./emails";

export type OrgRole = "owner" | "admin" | "member";

export interface CreateAuthOptions {
  handle: DbHandle<any>;
  /** Shown in emails. */
  appName: string;
  /** APP_URL, e.g. https://changekite.com (auth routes are mounted at /api/auth). */
  baseURL: string;
  /** SESSION_SECRET, at least 32 characters. */
  secret: string;
  /** Per-app cookie prefix ("ck", "dp", "wt") so apps on sibling domains never share cookies. */
  cookiePrefix: string;
  sendEmail: (msg: EmailMessage) => Promise<void>;
  emailTemplates?: Partial<AuthEmailTemplates>;
  /**
   * Called before a user is deleted, with the orgs where they are the ONLY owner. Those orgs (and their
   * members/invitations) are deleted right after this resolves: cancel billing and purge app data here.
   * Throwing aborts the deletion.
   */
  onBeforeUserDelete?: (userId: string, orgIdsOwnedSolely: string[]) => Promise<void>;
  /** Extra trusted origins (the baseURL origin is always trusted). */
  trustedOrigins?: string[];
  /**
   * Seat limit per organization (e.g. from billing entitlements). -1 or Infinity = unlimited.
   * Default: 100 (Better Auth's default).
   */
  getMemberLimit?: (orgId: string) => Promise<number> | number;
  /** Secure (+ __Secure- prefixed) cookies. Default: NODE_ENV === "production" or an https baseURL. */
  secureCookies?: boolean;
  /** Client IP resolution for rate limiting. Match the deployment proxy (see @repo/ops getClientIp). */
  ipAddress?: { ipAddressHeaders?: string[]; trustedProxies?: string[] };
  /**
   * Preferred over `ipAddress`: resolve the client IP from the incoming request with the deployment's trusted
   * proxy rules (e.g. `(h) => getClientIp(h, clientIpConfigFromEnv(process.env))`). The handler overwrites
   * CLIENT_IP_HEADER with the result (removing any client-supplied value) before Better Auth reads it.
   */
  resolveClientIp?: (headers: Headers) => string | null;
  /** Rate limiting is on by default in every environment. Only tests should ever disable it. */
  rateLimitEnabled?: boolean;
  /** Link put in invitation emails. Default: `${baseURL}/accept-invitation/${invitationId}`. */
  invitationURL?: (invitationId: string) => string;
}

const ROLE_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

/** Better Auth stores multiple roles comma separated; the highest one wins. */
export function highestRole(role: string | null | undefined): OrgRole | null {
  let best: OrgRole | null = null;
  for (const r of String(role ?? "").split(",").map((s) => s.trim())) {
    if (r in ROLE_RANK && (!best || ROLE_RANK[r as OrgRole] > ROLE_RANK[best])) best = r as OrgRole;
  }
  return best;
}

const IS_OWNER = (col: string) => `'owner' = ANY(string_to_array(replace(${col}, ' ', ''), ','))`;

/** URL-safe slug from a display name, plus a random suffix so it is unique without leaking the email. */
export function personalOrgSlug(name: string | null | undefined): string {
  const base =
    String(name ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/g, "") || "workspace";
  return `${base}-${randomBytes(4).toString("hex")}`;
}

function snakeFields<K extends string>(...keys: K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  return out;
}

/** Internal header carrying the server-resolved client IP into Better Auth; any client-sent value is replaced. */
export const CLIENT_IP_HEADER = "x-repo-client-ip";

const SESSION_EXPIRES_IN = 60 * 60 * 24 * 30; // 30 days
const SESSION_UPDATE_AGE = 60 * 60 * 24; // roll the expiry forward at most once a day

/** Builds the Better Auth options (exported for schema verification tests; apps use createAuth). */
export function buildAuthOptions(opts: CreateAuthOptions) {
  const seatLimit = async (orgId: string): Promise<number> => {
    if (!opts.getMemberLimit) return 100;
    const limit = await opts.getMemberLimit(orgId);
    return limit < 0 || !Number.isFinite(limit) ? Number.MAX_SAFE_INTEGER : limit;
  };
  if (!opts.secret || opts.secret.length < 32) throw new Error("createAuth: secret must be at least 32 characters");
  if (!/^[a-z0-9-]{1,16}$/i.test(opts.cookiePrefix)) throw new Error("createAuth: cookiePrefix must be 1-16 [a-z0-9-] chars");
  const baseOrigin = new URL(opts.baseURL).origin;
  const ex: SqlExecutor = opts.handle.executor;
  const templates: AuthEmailTemplates = { ...defaultEmailTemplates, ...opts.emailTemplates };
  const secure = opts.secureCookies ?? (process.env.NODE_ENV === "production" || baseOrigin.startsWith("https:"));
  const invitationURL = opts.invitationURL ?? ((id: string) => `${baseOrigin}/accept-invitation/${encodeURIComponent(id)}`);

  async function createPersonalOrganization(user: { id: string; name?: string | null }) {
    const displayName = String(user.name ?? "").trim().slice(0, 60);
    const orgName = displayName ? `${displayName}'s workspace` : "Personal workspace";
    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await opts.handle.transaction(async (tx) => {
        const orgId = randomUUID();
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO auth_organization (id, name, slug, metadata, created_at)
           VALUES ($1, $2, $3, $4, now()) ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [orgId, orgName, personalOrgSlug(displayName), JSON.stringify({ personal: true })],
        );
        if (rows.length === 0) return false;
        await tx.query(
          `INSERT INTO auth_member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'owner', now())`,
          [randomUUID(), orgId, user.id],
        );
        return true;
      });
      if (created) return;
    }
    throw new Error("Could not allocate a unique personal organization slug");
  }

  async function defaultActiveOrganization(userId: string): Promise<string | null> {
    const { rows } = await ex.query<{ organization_id: string }>(
      `SELECT m.organization_id FROM auth_member m
       JOIN auth_organization o ON o.id = m.organization_id
       WHERE m.user_id = $1
       ORDER BY (o.metadata IS NOT NULL AND o.metadata LIKE '%"personal":true%') DESC, ${IS_OWNER("m.role")} DESC, m.created_at ASC
       LIMIT 1`,
      [userId],
    );
    return rows[0]?.organization_id ?? null;
  }

  // Users whose orgs were already purged by the delete-user endpoint (so the DB hook does not repeat it).
  const purgedByEndpoint = new Set<string>();

  async function purgeOrganizationsForDeletedUser(userId: string) {
    const { rows } = await ex.query<{ id: string }>(
      `SELECT DISTINCT m.organization_id AS id FROM auth_member m
       WHERE m.user_id = $1 AND ${IS_OWNER("m.role")}
         AND NOT EXISTS (
           SELECT 1 FROM auth_member o
           WHERE o.organization_id = m.organization_id AND o.user_id <> $1 AND ${IS_OWNER("o.role")})
       ORDER BY 1`,
      [userId],
    );
    const orgIds = rows.map((r) => r.id);
    if (opts.onBeforeUserDelete) await opts.onBeforeUserDelete(userId, orgIds);
    await opts.handle.transaction(async (tx) => {
      if (orgIds.length > 0) {
        await tx.query(`DELETE FROM auth_invitation WHERE organization_id = ANY($1::text[])`, [orgIds]);
        await tx.query(`DELETE FROM auth_member WHERE organization_id = ANY($1::text[])`, [orgIds]);
        await tx.query(`UPDATE auth_session SET active_organization_id = NULL WHERE active_organization_id = ANY($1::text[])`, [orgIds]);
        await tx.query(`DELETE FROM auth_organization WHERE id = ANY($1::text[])`, [orgIds]);
      }
      // Memberships in orgs that survive (another owner exists) and invitations this user sent.
      await tx.query(`DELETE FROM auth_member WHERE user_id = $1`, [userId]);
      await tx.query(`DELETE FROM auth_invitation WHERE inviter_id = $1`, [userId]);
    });
  }

  const send = async (to: string, tag: string, rendered: { subject: string; text: string; html: string }) =>
    opts.sendEmail({ to, tag, ...rendered });

  return {
    appName: opts.appName,
    baseURL: baseOrigin,
    basePath: "/api/auth",
    secret: opts.secret,
    trustedOrigins: [baseOrigin, ...(opts.trustedOrigins ?? []).map((o) => new URL(o).origin)],
    telemetry: { enabled: false },
    database: drizzleAdapter(opts.handle.db, { provider: "pg", schema: authSchema, transaction: false }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
        await send(user.email, "auth.reset-password", templates.resetPassword({ appName: opts.appName, url, user }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
        await send(user.email, "auth.verify-email", templates.verifyEmail({ appName: opts.appName, url, user }));
      },
    },

    user: {
      modelName: "auth_user",
      fields: snakeFields("emailVerified", "createdAt", "updatedAt"),
      additionalFields: {
        // Platform role (customer | operator | owner). input:false => never accepted from sign-up/update bodies.
        role: { type: "string", required: false, defaultValue: "customer", input: false },
      },
      deleteUser: {
        enabled: true,
        beforeDelete: async (user: { id: string }) => {
          await purgeOrganizationsForDeletedUser(user.id);
          purgedByEndpoint.add(user.id);
        },
        afterDelete: async (user: { id: string }) => {
          purgedByEndpoint.delete(user.id);
        },
      },
    },
    session: {
      modelName: "auth_session",
      fields: snakeFields("expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"),
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
      // No cookie cache: every getSession reads the DB, so revocation and deletion take effect immediately.
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "auth_account",
      fields: snakeFields(
        "accountId",
        "providerId",
        "userId",
        "accessToken",
        "refreshToken",
        "idToken",
        "accessTokenExpiresAt",
        "refreshTokenExpiresAt",
        "createdAt",
        "updatedAt",
      ),
    },
    verification: {
      modelName: "auth_verification",
      fields: snakeFields("expiresAt", "createdAt", "updatedAt"),
    },

    rateLimit: {
      enabled: opts.rateLimitEnabled ?? true,
      storage: "database" as const,
      modelName: "auth_rate_limit",
      fields: snakeFields("lastRequest"),
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 5 },
        "/sign-up/*": { window: 60, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 5 },
        "/reset-password/*": { window: 300, max: 10 },
        "/send-verification-email": { window: 300, max: 3 },
        "/verify-email": { window: 60, max: 10 },
        "/change-password": { window: 60, max: 5 },
        "/delete-user": { window: 60, max: 5 },
        "/organization/invite-member": { window: 60, max: 10 },
      },
    },

    advanced: {
      cookiePrefix: opts.cookiePrefix,
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" as const, secure, path: "/" },
      // Better Auth skips origin/CSRF checks when NODE_ENV=test unless these are explicitly false.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: opts.resolveClientIp ? { ipAddressHeaders: [CLIENT_IP_HEADER] } : opts.ipAddress,
      database: { generateId: () => randomUUID() },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string; name?: string | null }) => {
            await createPersonalOrganization(user);
          },
        },
        delete: {
          before: async (user: { id: string }) => {
            // Any deletion path that bypasses the endpoint (admin tooling, internal adapter) still purges.
            if (purgedByEndpoint.has(user.id)) return;
            await purgeOrganizationsForDeletedUser(user.id);
          },
        },
      },
      session: {
        create: {
          before: async (session: { userId: string; activeOrganizationId?: string | null }) => {
            if (session.activeOrganizationId) return;
            const activeOrganizationId = await defaultActiveOrganization(session.userId);
            if (activeOrganizationId) return { data: { ...session, activeOrganizationId } };
          },
        },
      },
    },

    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: "owner",
        requireEmailVerificationOnInvitation: true,
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        membershipLimit: async (_user, org) => seatLimit(org.id),
        organizationHooks: {
          // Better Auth only checks membershipLimit when an invitation is ACCEPTED; refuse new invitations
          // once members + pending invitations already fill the plan's seats.
          beforeCreateInvitation: async ({ invitation }) => {
            const limit = await seatLimit(invitation.organizationId);
            const { rows } = await opts.handle.executor.query<{ n: number }>(
              `SELECT (SELECT count(*) FROM auth_member WHERE organization_id = $1)
                    + (SELECT count(*) FROM auth_invitation WHERE organization_id = $1 AND status = 'pending'
                         AND expires_at > now() AND lower(email) <> lower($2))::int AS n`,
              [invitation.organizationId, invitation.email],
            );
            if (Number(rows[0]?.n ?? 0) >= limit) {
              throw new APIError("FORBIDDEN", { message: "Seat limit reached for this plan", code: "SEAT_LIMIT_REACHED" });
            }
          },
        },
        sendInvitationEmail: async (data) => {
          await send(
            data.email,
            "auth.invitation",
            templates.invitation({
              appName: opts.appName,
              url: invitationURL(data.id),
              email: data.email,
              inviterName: data.inviter.user.name,
              inviterEmail: data.inviter.user.email,
              organizationName: data.organization.name,
              role: data.role,
            }),
          );
        },
        schema: {
          session: { fields: { activeOrganizationId: "active_organization_id" } },
          organization: { modelName: "auth_organization", fields: { createdAt: "created_at" } },
          member: {
            modelName: "auth_member",
            fields: { organizationId: "organization_id", userId: "user_id", createdAt: "created_at" },
          },
          invitation: {
            modelName: "auth_invitation",
            fields: {
              organizationId: "organization_id",
              expiresAt: "expires_at",
              createdAt: "created_at",
              inviterId: "inviter_id",
            },
          },
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(opts: CreateAuthOptions) {
  const options = buildAuthOptions(opts);
  const ba = betterAuth(options);
  const ex = opts.handle.executor;

  async function getSession(headers: Headers) {
    const result = await ba.api.getSession({ headers });
    return result ?? null;
  }

  async function requireUser(headers: Headers) {
    const s = await getSession(headers);
    if (!s) throw new AuthError(401, "UNAUTHENTICATED");
    return s;
  }

  /**
   * Resolves the organization for this request and VERIFIES membership in the database.
   * orgId defaults to the session's active organization. Non-members get 404 (not 403) so org ids
   * cannot be probed; members below the required role get 403.
   */
  async function requireOrg(headers: Headers, o: { role?: OrgRole; orgId?: string } = {}) {
    const s = await requireUser(headers);
    const orgId = o.orgId ?? (s.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
    if (!orgId) throw new AuthError(404, "NO_ACTIVE_ORGANIZATION", "No active organization");
    const { rows } = await ex.query<{ id: string; name: string; slug: string; role: string }>(
      `SELECT o.id, o.name, o.slug, m.role FROM auth_member m
       JOIN auth_organization o ON o.id = m.organization_id
       WHERE m.user_id = $1 AND m.organization_id = $2
       LIMIT 1`,
      [s.user.id, orgId],
    );
    const row = rows[0];
    if (!row) throw new AuthError(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
    const role = highestRole(row.role);
    if (!role) throw new AuthError(403, "FORBIDDEN");
    if (o.role && ROLE_RANK[role] < ROLE_RANK[o.role]) throw new AuthError(403, "INSUFFICIENT_ROLE");
    return { user: s.user, session: s.session, org: { id: row.id, name: row.name, slug: row.slug }, role };
  }

  return {
    api: ba.api,
    handler: (req: Request) => ba.handler(withResolvedClientIp(req, opts.resolveClientIp)),
    getSession,
    requireUser,
    requireOrg,
    $betterAuth: ba,
  };
}

function withResolvedClientIp(req: Request, resolve: CreateAuthOptions["resolveClientIp"]): Request {
  if (!resolve) return req;
  const headers = new Headers(req.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = resolve(req.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  const init: RequestInit & { duplex?: "half" } = { method: req.method, headers, signal: req.signal };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    init.duplex = "half";
  }
  return new Request(req.url, init);
}

export type AppAuth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<AppAuth["getSession"]>>>;
