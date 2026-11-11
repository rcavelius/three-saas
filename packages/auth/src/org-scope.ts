/**
 * Tenancy helper: every customer resource row carries `org_id text`, and every query an app runs on
 * behalf of a user must be scoped by the org id that `auth.requireOrg()` returned (membership is
 * verified server-side there). Never take an org id from the request body/query and use it directly.
 *
 * Pattern:
 *
 *   const { org } = await auth.requireOrg(req.headers, { role: "member" });
 *   const scope = orgScope(org.id);
 *   // drizzle
 *   const rows = await db.select().from(sites).where(scope.where(sites.org_id, eq(sites.id, siteId)));
 *   await db.insert(sites).values(scope.values({ url }));                 // org_id forced server-side
 *   await db.update(sites).set(patch).where(scope.where(sites.org_id, eq(sites.id, siteId)));
 *   // raw SQL (SqlExecutor): org id is always the first parameter
 *   await ex.query(`SELECT * FROM sites WHERE org_id = $1 AND id = $2`, scope.params(siteId));
 *
 * A lookup by id that returns nothing for this org must be reported as 404, not 403, so ids of other
 * tenants' resources cannot be probed.
 */
import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { AuthError } from "./errors";

export interface OrgScope {
  readonly orgId: string;
  /** `org_id = $orgId AND ...extra` for drizzle `.where()`. */
  where(orgColumn: AnyPgColumn, ...extra: (SQL | undefined)[]): SQL;
  /** Returns a copy of `row` with `org_id` forced to this org (any client-supplied org_id is overwritten). */
  values<T extends Record<string, unknown>>(row: T): Omit<T, "org_id"> & { org_id: string };
  /** Positional params for raw SQL where `$1` is the org id. */
  params(...rest: unknown[]): unknown[];
  /** Throws AuthError(404) when a row does not belong to this org (or is missing). */
  assertOwns<T extends { org_id?: unknown; orgId?: unknown }>(row: T | null | undefined): T;
}

export function orgScope(orgId: string): OrgScope {
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new AuthError(403, "NO_ORGANIZATION", "No organization in scope");
  }
  return {
    orgId,
    where(orgColumn, ...extra) {
      return and(eq(orgColumn, orgId), ...extra) as SQL;
    },
    values(row) {
      const { org_id: _ignored, ...rest } = row as Record<string, unknown>;
      return { ...rest, org_id: orgId } as Omit<typeof row, "org_id"> & { org_id: string };
    },
    params(...rest) {
      return [orgId, ...rest];
    },
    assertOwns(row) {
      const owner = row ? (row.org_id ?? row.orgId) : undefined;
      if (!row || owner !== orgId) throw new AuthError(404, "NOT_FOUND");
      return row;
    },
  };
}
