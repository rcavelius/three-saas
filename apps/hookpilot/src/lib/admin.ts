import type { Platform } from "./platform";

/**
 * Platform operators (auth_user.role 'operator' or 'owner', set only by SQL, never from client input).
 * Returns null for everyone else; /admin then answers 404.
 */
export async function getOperator(p: Platform, headers: Headers): Promise<{ id: string; email: string; role: string } | null> {
  const s = await p.auth.getSession(headers);
  if (!s) return null;
  // Re-read the role from the database (not from any cached session payload).
  const { rows } = await p.ex.query<{ role: string; email: string }>(`SELECT role, email FROM auth_user WHERE id = $1`, [s.user.id]);
  const row = rows[0];
  if (!row || (row.role !== "operator" && row.role !== "owner")) return null;
  return { id: s.user.id, email: row.email, role: row.role };
}
