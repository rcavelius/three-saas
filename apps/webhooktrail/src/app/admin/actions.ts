"use server";

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { recordCost, resolveIncident, setBudget, setSetting } from "@repo/ops";
import { getOperator } from "@/lib/admin";
import { getPlatform } from "@/lib/platform";
import { UUID_RE } from "@/lib/ids";

/** Every action re-checks the operator role on the server (Next also enforces same-origin for actions). */
async function operator() {
  const p = await getPlatform();
  const op = await getOperator(p, new Headers(await headers()));
  if (!op) notFound();
  return { p, op };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function resolveIncidentAction(f: FormData): Promise<void> {
  const { p } = await operator();
  const id = str(f, "id");
  if (UUID_RE.test(id)) await resolveIncident(p.ex, id);
  revalidatePath("/admin");
}

export async function acknowledgeIncidentAction(f: FormData): Promise<void> {
  const { p, op } = await operator();
  const id = str(f, "id");
  if (UUID_RE.test(id)) await setSetting(p.ex, `webhooktrail.incident_ack.${id}`, { by: op.email, at: new Date().toISOString() });
  revalidatePath("/admin");
}

export async function retryDeadLetterAction(f: FormData): Promise<void> {
  const { p } = await operator();
  const id = str(f, "id");
  if (UUID_RE.test(id)) await p.scheduler.retryDeadLetter(id);
  revalidatePath("/admin");
}

export async function setBudgetAction(f: FormData): Promise<void> {
  const { p } = await operator();
  const name = str(f, "name").toLowerCase();
  const usd = Number(str(f, "usd"));
  if (/^[a-z0-9_.-]{1,50}$/.test(name) && Number.isFinite(usd) && usd >= 0 && usd <= 1_000_000) {
    await setBudget(p.ex, { name, monthlyLimitCents: Math.round(usd * 100) });
  }
  revalidatePath("/admin");
}

export async function recordCostAction(f: FormData): Promise<void> {
  const { p } = await operator();
  const usd = Number(str(f, "usd"));
  const provider = str(f, "provider");
  if (!Number.isFinite(usd) || usd < 0 || usd > 1_000_000 || !/^[a-z0-9_.-]{1,50}$/i.test(provider)) return;
  const now = new Date();
  await recordCost(p.ex, {
    provider,
    description: str(f, "description").slice(0, 500) || "manual entry",
    amountCents: Math.round(usd * 100),
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    periodEnd: now,
    source: "manual",
  });
  revalidatePath("/admin");
}
