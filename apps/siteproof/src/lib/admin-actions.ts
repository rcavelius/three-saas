/**
 * /admin form actions (POST, same-origin, operator/owner platform role only; everyone else gets 404).
 * Each action redirects back to /admin with a short status message.
 */
import { monthStartUtc, nextMonthStartUtc, recordCost, resolveIncident, setBudget } from "@repo/ops";
import { getPlatform, type Platform } from "./platform";
import { isOperator, isSameOrigin, notFound } from "./http";

type Action = (p: Platform, form: FormData, operator: { id: string; email: string }) => Promise<string>;

function back(appUrl: string, msg: string): Response {
  const u = new URL("/admin", appUrl);
  u.searchParams.set("msg", msg.slice(0, 120));
  return new Response(null, { status: 303, headers: { location: u.pathname + u.search, "cache-control": "no-store" } });
}

export function adminAction(action: Action) {
  return async (req: Request): Promise<Response> => {
    const p = await getPlatform();
    const operator = await isOperator(p, req.headers);
    if (!operator) return notFound();
    if (!isSameOrigin(req, p.env.APP_URL)) return new Response("cross-origin", { status: 403 });
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return back(p.env.APP_URL, "Invalid form");
    }
    try {
      return back(p.env.APP_URL, await action(p, form, operator));
    } catch (err) {
      p.logger.warn("admin action failed", { err });
      return back(p.env.APP_URL, err instanceof Error ? err.message : "Action failed");
    }
  };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export const incidentAction = adminAction(async (p, f, op) => {
  const id = str(f, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return "Unknown incident";
  if (str(f, "op") === "resolve") return (await resolveIncident(p.handle.executor, id, { now: p.now() })) ? "Incident resolved" : "Already resolved";
  await p.handle.executor.query(
    `UPDATE incidents SET details = details || jsonb_build_object('acknowledged_by', $2::text, 'acknowledged_at', $3::text) WHERE id = $1 AND status = 'open'`,
    [id, op.email, p.now().toISOString()],
  );
  return "Incident acknowledged";
});

export const deadLetterAction = adminAction(async (p, f) => {
  const id = str(f, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return "Unknown job";
  return (await p.scheduler.retryDeadLetter(id)) ? "Job queued again" : "Job not found";
});

export const budgetAction = adminAction(async (p, f) => {
  const name = str(f, "name").toLowerCase();
  const dollars = Number(str(f, "limitUsd"));
  if (!/^[a-z0-9_.-]{1,50}$/.test(name)) return "Budget name: letters, digits, . _ -";
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) return "Enter a monthly limit in USD";
  await setBudget(p.handle.executor, { name, monthlyLimitCents: Math.round(dollars * 100) }, p.now());
  return `Budget ${name} set to $${dollars.toFixed(2)}/month`;
});

export const costAction = adminAction(async (p, f) => {
  const provider = str(f, "provider").toLowerCase();
  const dollars = Number(str(f, "amountUsd"));
  const description = str(f, "description") || "manual entry";
  if (!/^[a-z0-9_.-]{1,50}$/.test(provider)) return "Provider: letters, digits, . _ -";
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 1_000_000) return "Enter an amount in USD";
  const now = p.now();
  await recordCost(p.handle.executor, {
    provider,
    description,
    amountCents: Math.round(dollars * 100),
    periodStart: monthStartUtc(now),
    periodEnd: new Date(nextMonthStartUtc(now).getTime() - 1),
    source: "manual",
  });
  return `Recorded $${dollars.toFixed(2)} for ${provider}`;
});
