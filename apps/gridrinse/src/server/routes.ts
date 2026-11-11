/**
 * API route handlers as plain (platform, Request) => Response functions so tests can call them
 * directly; the files under src/app/api only bind them to Next's router.
 *
 * Authorization rules:
 * - Every workflow query is scoped by the org id from auth.requireOrg() (membership verified in the
 *   database), never by an id from the request. Another org's workflow id answers 404.
 * - Plan limits come only from billing.getEntitlements(orgId) on the server.
 * - Mutating routes require a same-origin request and are rate limited per trusted client IP and per user.
 */
import { checkoutRoute, getFreePlan, portalRoute, webhookRoute } from "@repo/billing";
import { getClientIp, recordCost, resolveIncident, setBudget } from "@repo/ops";
import { cronTickRoute, eventsRoute, healthRoute, MAX_EVENT_BODY_BYTES } from "@repo/ops/next";
import { EVENT_SPEC, sanitizeEventProps, type EventName } from "@/lib/analytics";
import { WorkflowWriteSchema } from "@/lib/workflowPolicy";
import type { ClientEntitlements } from "@/lib/limits";
import { ApiError, assertSameOrigin, guarded, json, limitByIp, limitByKey, readJson } from "./http";
import { CATALOG, CLIENT_IP_HEADER, type Platform } from "./platform";

const MINUTE = 60_000;
const MAX_WORKFLOW_BODY = 64 * 1024;
const MAX_AUTH_BODY = 64 * 1024;

// ------------------------------------------------------------------------------------------------
// Auth (Better Auth) — the trusted client IP is put into CLIENT_IP_HEADER, overwriting anything sent.

export async function authRoute(p: Platform, req: Request): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = getClientIp(req.headers, p.env.clientIp);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_AUTH_BODY) return json(413, { error: "too_large" });
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_AUTH_BODY) return json(413, { error: "too_large" });
    if (new URL(req.url).pathname.endsWith("/organization/invite-member")) {
      const refused = await seatCheck(p, req.headers, body);
      if (refused) return refused;
    }
  }
  return p.auth.handler(new Request(req.url, { method: req.method, headers, body, redirect: "manual" }));
}

/**
 * Team seats are enforced on the server: Better Auth checks the member limit when an invitation is
 * ACCEPTED (getMemberLimit); this also refuses NEW invitations once members + pending invitations
 * fill the plan's seats, so nobody is invited into a team they cannot join.
 */
async function seatCheck(p: Platform, headers: Headers, body: ArrayBuffer): Promise<Response | null> {
  let orgId: string | undefined;
  try {
    const parsed = JSON.parse(Buffer.from(body).toString("utf8")) as { organizationId?: unknown };
    if (typeof parsed.organizationId === "string") orgId = parsed.organizationId;
  } catch {
    return null; // Better Auth rejects the malformed body itself
  }
  let org: { id: string };
  try {
    ({ org } = await p.auth.requireOrg(headers, orgId ? { orgId } : {}));
  } catch {
    return null; // not signed in / not a member: Better Auth answers with its own error
  }
  const seats = (await p.billing.getEntitlements(org.id)).limits.teamSeats ?? 1;
  if (seats < 0) return null;
  const { rows } = await p.handle.executor.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM auth_member WHERE organization_id = $1)
          + (SELECT count(*) FROM auth_invitation WHERE organization_id = $1 AND status = 'pending' AND expires_at > $2) AS n`,
    [org.id, p.now().toISOString()],
  );
  if (Number(rows[0]?.n ?? 0) < seats) return null;
  return json(403, {
    code: "SEAT_LIMIT_REACHED",
    message: seats <= 1 ? "Team members are part of the Business plan." : `All ${seats} seats of your plan are in use (members and pending invitations).`,
  });
}

// ------------------------------------------------------------------------------------------------
// Entitlements: what the browser applies to local processing (value fences, not security
// boundaries: files never reach the server, so there is nothing server-side to protect there).

export async function entitlementsRoute(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    await limitByIp(p.handle.executor, p.env.clientIp, req, "ent", 120, MINUTE, p.now());
    const session = await p.auth.getSession(req.headers);
    if (!session) {
      const free = getFreePlan(CATALOG);
      const body: ClientEntitlements = {
        signedIn: false,
        planId: free.id,
        planName: free.name,
        status: "none",
        limits: { ...free.limits },
        features: { ...free.features },
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        graceEndsAt: null,
        org: null,
        usage: null,
        billingConfigured: p.billingConfigured,
      };
      return json(200, body);
    }
    const { org, role, user } = await p.auth.requireOrg(req.headers);
    const ent = await p.billing.getEntitlements(org.id);
    const { rows } = await p.handle.executor.query<{ n: number }>(`SELECT count(*)::int AS n FROM auth_member WHERE organization_id = $1`, [org.id]);
    const body: ClientEntitlements = {
      signedIn: true,
      planId: ent.planId,
      planName: ent.planName,
      status: ent.status,
      limits: ent.limits,
      features: ent.features,
      cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
      currentPeriodEnd: ent.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: ent.graceEndsAt?.toISOString() ?? null,
      subscribedPlanId: ent.subscribedPlanId,
      org: { id: org.id, name: org.name, role },
      user: { id: user.id, email: user.email, name: user.name },
      usage: { savedWorkflows: await p.workflows.count(org.id), teamSeats: Number(rows[0]?.n ?? 1) },
      billingConfigured: p.billingConfigured,
    };
    return json(200, body);
  });
}

// ------------------------------------------------------------------------------------------------
// Saved workflows (org-scoped)

async function workflowContext(p: Platform, req: Request, mutating: boolean) {
  if (mutating) assertSameOrigin(req, p.env.appUrl);
  await limitByIp(p.handle.executor, p.env.clientIp, req, mutating ? "wf-write" : "wf-read", mutating ? 60 : 240, MINUTE, p.now());
  const ctx = await p.auth.requireOrg(req.headers);
  if (mutating) await limitByKey(p.handle.executor, `wf-write-user:${ctx.user.id}`, 60, MINUTE, p.now());
  const ent = await p.billing.getEntitlements(ctx.org.id);
  return { ...ctx, ent, limit: ent.limits.savedWorkflows ?? 0 };
}

async function parseWrite(req: Request) {
  const body = await readJson(req, MAX_WORKFLOW_BODY);
  const r = WorkflowWriteSchema.safeParse(body);
  if (!r.success) {
    const message = r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ApiError(400, "invalid_workflow", message);
  }
  return r.data;
}

export async function listWorkflowsRoute(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    const { org, limit, ent } = await workflowContext(p, req, false);
    const workflows = await p.workflows.list(org.id, limit);
    return json(200, { workflows, limit, used: workflows.length, cloudWorkflows: ent.features.cloudWorkflows === true });
  });
}

export async function createWorkflowRoute(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    const { org, user, limit } = await workflowContext(p, req, true);
    const input = await parseWrite(req);
    return json(201, { workflow: await p.workflows.create(org.id, user.id, input, limit) });
  });
}

export async function getWorkflowRoute(p: Platform, req: Request, id: string): Promise<Response> {
  return guarded(async () => {
    const { org, limit } = await workflowContext(p, req, false);
    return json(200, { workflow: await p.workflows.get(org.id, id, limit) });
  });
}

export async function updateWorkflowRoute(p: Platform, req: Request, id: string): Promise<Response> {
  return guarded(async () => {
    const { org, user, role, limit } = await workflowContext(p, req, true);
    const input = await parseWrite(req);
    return json(200, { workflow: await p.workflows.update(org.id, id, input, limit, { userId: user.id, role }) });
  });
}

export async function deleteWorkflowRoute(p: Platform, req: Request, id: string): Promise<Response> {
  return guarded(async () => {
    const { org, user, role } = await workflowContext(p, req, true);
    await p.workflows.remove(org.id, id, { userId: user.id, role });
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  });
}

// ------------------------------------------------------------------------------------------------
// Billing

async function resolveOwnerOrg(p: Platform, req: Request) {
  const { org, user } = await p.auth.requireOrg(req.headers, { role: "owner" });
  return { orgId: org.id, email: user.email };
}

const notConfigured = () =>
  json(503, { error: "billing_not_configured", message: "Payments are not switched on yet. Your plan stays as it is; nothing is charged." });

export async function checkoutRouteHandler(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    await limitByIp(p.handle.executor, p.env.clientIp, req, "billing", 20, MINUTE, p.now());
    if (!p.billingConfigured) {
      assertSameOrigin(req, p.env.appUrl);
      await resolveOwnerOrg(p, req);
      return notConfigured();
    }
    return checkoutRoute(p.billing, (r) => resolveOwnerOrg(p, r))(req);
  });
}

export async function portalRouteHandler(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    await limitByIp(p.handle.executor, p.env.clientIp, req, "billing", 20, MINUTE, p.now());
    if (!p.billingConfigured) {
      assertSameOrigin(req, p.env.appUrl);
      await resolveOwnerOrg(p, req);
      return notConfigured();
    }
    return portalRoute(p.billing, (r) => resolveOwnerOrg(p, r))(req);
  });
}

export async function webhookRouteHandler(p: Platform, req: Request): Promise<Response> {
  return webhookRoute(p.billing)(req);
}

// ------------------------------------------------------------------------------------------------
// Ops

export async function healthRouteHandler(p: Platform, req: Request): Promise<Response> {
  return healthRoute({ handle: p.handle, version: p.env.version, detailsSecret: p.env.healthDetailsSecret, now: p.now })(req);
}

export async function cronRouteHandler(p: Platform, req: Request): Promise<Response> {
  // Serverless hosts cap function time (Netlify free: ~10 s), so the tick budget is configurable.
  const budgetMs = Number(process.env.CRON_TICK_BUDGET_MS) > 0 ? Number(process.env.CRON_TICK_BUDGET_MS) : undefined;
  return cronTickRoute({ scheduler: p.scheduler, secret: p.env.cronSecret, budgetMs })(req);
}

/**
 * Defence in depth for analytics: besides the shared route's own checks (same origin, size, rate
 * limit, PII scrubbing), only GridRinse's allow-listed props survive — counts and fixed words, never
 * free text such as file names or cell values — before the event reaches the shared handler.
 */
export async function eventsRouteHandler(p: Platform, req: Request): Promise<Response> {
  if (req.method === "POST") {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_EVENT_BODY_BYTES) return json(413, { error: "too_large" });
    const raw = await req.arrayBuffer();
    if (raw.byteLength > MAX_EVENT_BODY_BYTES) return json(413, { error: "too_large" });
    let body: unknown;
    try {
      body = JSON.parse(Buffer.from(raw).toString("utf8"));
    } catch {
      return json(400, { error: "invalid_json" });
    }
    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (typeof b.name !== "string" || !(b.name in EVENT_SPEC)) return json(400, { error: "event_not_allowed" });
    const clean = JSON.stringify({
      name: b.name,
      anonymousId: typeof b.anonymousId === "string" ? b.anonymousId : null,
      path: typeof b.path === "string" ? b.path : null,
      props: sanitizeEventProps(b.name as EventName, (b.props && typeof b.props === "object" ? b.props : {}) as Record<string, unknown>),
    });
    const headers = new Headers(req.headers);
    headers.set("content-type", "application/json");
    headers.delete("content-length");
    req = new Request(req.url, { method: "POST", headers, body: clean });
  }
  return eventsRoute({
    handle: p.handle,
    clientIp: p.env.clientIp,
    rateLimit: { limit: 60, windowMs: MINUTE },
    allowedOrigins: [p.env.appUrl],
    getUserId: async (r) => (await p.auth.getSession(r.headers))?.user.id ?? null,
    now: p.now,
  })(req);
}

// ------------------------------------------------------------------------------------------------
// Internal ops dashboard actions (operator/owner platform role only; everyone else gets 404)

export async function requireOperator(p: Platform, headers: Headers) {
  const s = await p.auth.getSession(headers);
  const role = (s?.user as { role?: string } | undefined)?.role;
  if (!s || (role !== "operator" && role !== "owner")) return null;
  return s;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function adminActionRoute(p: Platform, req: Request): Promise<Response> {
  return guarded(async () => {
    const s = await requireOperator(p, req.headers);
    if (!s) return json(404, { error: "not_found" });
    assertSameOrigin(req, p.env.appUrl);
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.startsWith("application/x-www-form-urlencoded") && !ct.startsWith("multipart/form-data")) throw new ApiError(415, "unsupported_media_type");
    const f = await req.formData();
    const action = String(f.get("action") ?? "");
    const ex = p.handle.executor;
    const now = p.now();
    let note = "done";
    switch (action) {
      case "ack": {
        const id = String(f.get("id") ?? "");
        if (!UUID_RE.test(id)) throw new ApiError(400, "invalid_id");
        await ex.query(
          `UPDATE incidents SET details = details || jsonb_build_object('acknowledged_at', $2::text, 'acknowledged_by', $3::text) WHERE id = $1 AND status = 'open'`,
          [id, now.toISOString(), s.user.id],
        );
        note = "acknowledged";
        break;
      }
      case "resolve": {
        const id = String(f.get("id") ?? "");
        if (!UUID_RE.test(id)) throw new ApiError(400, "invalid_id");
        await resolveIncident(ex, id, { now });
        note = "resolved";
        break;
      }
      case "retry": {
        const id = String(f.get("id") ?? "");
        if (!UUID_RE.test(id)) throw new ApiError(400, "invalid_id");
        note = (await p.scheduler.retryDeadLetter(id)) ? "requeued" : "not-found";
        break;
      }
      case "budget": {
        const name = String(f.get("name") ?? "").trim().toLowerCase();
        const dollars = Number(f.get("limit"));
        if (!/^[a-z0-9_.-]{1,50}$/.test(name) || !Number.isFinite(dollars) || dollars <= 0 || dollars > 1_000_000) throw new ApiError(400, "invalid_budget");
        await setBudget(ex, { name, monthlyLimitCents: Math.round(dollars * 100) }, now);
        note = "budget-saved";
        break;
      }
      case "cost": {
        const provider = String(f.get("provider") ?? "").trim();
        const dollars = Number(f.get("amount"));
        const description = String(f.get("description") ?? "").slice(0, 500);
        if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) throw new ApiError(400, "invalid_amount");
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        try {
          await recordCost(ex, { provider, description: description || provider, amountCents: Math.round(dollars * 100), periodStart: start, periodEnd: now, source: "manual" });
        } catch (e) {
          throw new ApiError(400, "invalid_cost", e instanceof Error ? e.message : "invalid");
        }
        note = "cost-recorded";
        break;
      }
      default:
        throw new ApiError(400, "unknown_action");
    }
    return new Response(null, { status: 303, headers: { location: `/admin?done=${note}`, "cache-control": "no-store" } });
  });
}
