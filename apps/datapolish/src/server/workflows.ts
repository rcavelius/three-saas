/**
 * Saved workflows in the database, always scoped by the org id that auth.requireOrg() verified.
 * Count limits (plan `savedWorkflows`) are enforced inside a transaction holding withOrgLock, so
 * concurrent creates cannot exceed the limit. Rows over the limit (after a downgrade) are kept but
 * locked: they can be applied, exported or deleted, not edited.
 */
import type { DbHandle, SqlExecutor } from "@repo/database";
import { withOrgLock } from "@repo/billing";
import { orgScope } from "@repo/auth";
import { StepSchema, type Step } from "@/lib/engine/schema";
import type { StoredWorkflow, WorkflowWrite } from "@/lib/workflowPolicy";
import { ApiError } from "./http";

interface Row {
  id: string;
  org_id: string;
  name: string;
  pipeline: unknown;
  version: number;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = "id, org_id, name, pipeline, version, created_by, created_at, updated_at";
const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stepsOf(pipeline: unknown): Step[] {
  const raw = typeof pipeline === "string" ? JSON.parse(pipeline) : pipeline;
  const steps = (raw as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return [];
  const out: Step[] = [];
  for (const s of steps) {
    const r = StepSchema.safeParse(s);
    if (r.success) out.push(r.data);
  }
  return out;
}

function toApi(r: Row, locked: boolean): StoredWorkflow {
  return {
    id: r.id,
    name: r.name,
    steps: stepsOf(r.pipeline),
    version: Number(r.version),
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    locked,
  };
}

/** Which of an org's workflows are over the limit: the newest ones beyond `limit` (oldest stay usable). */
function lockedIds(rows: { id: string }[], limit: number): Set<string> {
  if (limit < 0) return new Set();
  return new Set(rows.slice(limit).map((r) => r.id));
}

function assertId(id: string) {
  if (!UUID_RE.test(id)) throw new ApiError(404, "not_found", "Workflow not found.");
}

export function workflowRepo(handle: DbHandle<any>) {
  const ex = handle.executor;

  async function orderedIds(q: SqlExecutor, orgId: string): Promise<{ id: string }[]> {
    const { rows } = await q.query<{ id: string }>(`SELECT id FROM workflows WHERE org_id = $1 ORDER BY created_at ASC, id ASC`, [orgId]);
    return rows;
  }

  return {
    async count(orgId: string): Promise<number> {
      const { rows } = await ex.query<{ n: number }>(`SELECT count(*)::int AS n FROM workflows WHERE org_id = $1`, [orgId]);
      return Number(rows[0]?.n ?? 0);
    },

    async list(orgId: string, limit: number): Promise<StoredWorkflow[]> {
      const scope = orgScope(orgId);
      const { rows } = await ex.query<Row>(`SELECT ${COLS} FROM workflows WHERE org_id = $1 ORDER BY created_at ASC, id ASC`, scope.params());
      const locked = lockedIds(rows, limit);
      return rows.map((r) => toApi(r, locked.has(r.id)));
    },

    async get(orgId: string, id: string, limit: number): Promise<StoredWorkflow> {
      assertId(id);
      const scope = orgScope(orgId);
      const { rows } = await ex.query<Row>(`SELECT ${COLS} FROM workflows WHERE org_id = $1 AND id = $2`, scope.params(id));
      const row = scope.assertOwns(rows[0]);
      const locked = lockedIds(await orderedIds(ex, orgId), limit);
      return toApi(row, locked.has(row.id));
    },

    async create(orgId: string, userId: string, input: WorkflowWrite, limit: number): Promise<StoredWorkflow> {
      return handle.transaction(async (tx) => {
        await withOrgLock(tx, orgId);
        const { rows: c } = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM workflows WHERE org_id = $1`, [orgId]);
        const n = Number(c[0]?.n ?? 0);
        if (limit === 0) throw new ApiError(403, "plan_required", "Saving workflows to your account needs the Pro or Business plan. Workflows saved in this browser keep working.");
        if (limit >= 0 && n >= limit) throw new ApiError(403, "plan_limit", `Your plan includes ${limit} saved workflows and you have ${n}. Delete one or upgrade.`);
        const dup = await tx.query(`SELECT 1 FROM workflows WHERE org_id = $1 AND lower(name) = lower($2)`, [orgId, input.name]);
        if (dup.rows.length) throw new ApiError(409, "name_taken", `A workflow named "${input.name}" already exists.`);
        const { rows } = await tx.query<Row>(
          `INSERT INTO workflows (org_id, name, pipeline, version, created_by) VALUES ($1, $2, $3::jsonb, 1, $4) RETURNING ${COLS}`,
          [orgId, input.name, JSON.stringify({ steps: input.steps }), userId],
        );
        return toApi(rows[0]!, false);
      });
    },

    /** Same rule as delete: members may edit their own workflows; admins and owners any workflow of the org. */
    async update(
      orgId: string,
      id: string,
      input: WorkflowWrite,
      limit: number,
      actor: { userId: string; role: "owner" | "admin" | "member" },
    ): Promise<StoredWorkflow> {
      assertId(id);
      return handle.transaction(async (tx) => {
        await withOrgLock(tx, orgId);
        const scope = orgScope(orgId);
        const { rows } = await tx.query<Row>(`SELECT ${COLS} FROM workflows WHERE org_id = $1 AND id = $2 FOR UPDATE`, scope.params(id));
        const row = scope.assertOwns(rows[0]);
        if (actor.role === "member" && row.created_by !== actor.userId) {
          throw new ApiError(403, "forbidden", "Only the person who saved this workflow, or an admin, can change it.");
        }
        if (lockedIds(await orderedIds(tx, orgId), limit).has(row.id)) {
          throw new ApiError(403, "workflow_locked", "This workflow is over your plan's limit and is read-only. Export or delete it, or upgrade to edit it.");
        }
        if (input.expectedVersion !== undefined && input.expectedVersion !== Number(row.version)) {
          throw new ApiError(409, "version_conflict", "This workflow changed since you loaded it. Reload and try again.");
        }
        const dup = await tx.query(`SELECT 1 FROM workflows WHERE org_id = $1 AND lower(name) = lower($2) AND id <> $3`, [orgId, input.name, id]);
        if (dup.rows.length) throw new ApiError(409, "name_taken", `A workflow named "${input.name}" already exists.`);
        const { rows: out } = await tx.query<Row>(
          `UPDATE workflows SET name = $3, pipeline = $4::jsonb, version = version + 1, updated_at = now()
           WHERE org_id = $1 AND id = $2 RETURNING ${COLS}`,
          scope.params(id, input.name, JSON.stringify({ steps: input.steps })),
        );
        return toApi(out[0]!, false);
      });
    },

    /** Members may delete their own workflows; admins and owners any workflow of the org. */
    async remove(orgId: string, id: string, actor: { userId: string; role: "owner" | "admin" | "member" }): Promise<void> {
      assertId(id);
      const scope = orgScope(orgId);
      const { rows } = await ex.query<Row>(`SELECT ${COLS} FROM workflows WHERE org_id = $1 AND id = $2`, scope.params(id));
      const row = scope.assertOwns(rows[0]);
      if (actor.role === "member" && row.created_by !== actor.userId) {
        throw new ApiError(403, "forbidden", "Only the person who saved this workflow, or an admin, can delete it.");
      }
      await ex.query(`DELETE FROM workflows WHERE org_id = $1 AND id = $2`, scope.params(id));
    },

    /** Account deletion: remove every workflow of orgs that are being deleted. */
    async purgeOrgs(orgIds: string[]): Promise<number> {
      if (orgIds.length === 0) return 0;
      const { rows } = await ex.query<{ id: string }>(`DELETE FROM workflows WHERE org_id = ANY($1::text[]) RETURNING id`, [orgIds]);
      return rows.length;
    },
  };
}

export type WorkflowRepo = ReturnType<typeof workflowRepo>;
