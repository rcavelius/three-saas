"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { downloadBlob, MIME } from "@/lib/download";
import { makeWorkflow, parseWorkflow, type Step, type Workflow } from "@/lib/engine/schema";
import { formatLimit, type ClientEntitlements } from "@/lib/limits";
import { newStepId } from "@/lib/steps";
import { workflowProblems, type StoredWorkflow } from "@/lib/workflowPolicy";
import { loadSavedWorkflows, storeWorkflows, upsertWorkflow } from "@/lib/workflowStore";

function fileSafe(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "workflow";
}

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; message: string; code?: string }> {
  try {
    const res = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) return { ok: false, message: body.message ?? `Request failed (${res.status}).`, code: body.error };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, message: "Could not reach the server. Your workflows in this browser still work." };
  }
}

export function WorkflowPanel({
  steps,
  onLoad,
  entitlements,
  onAccountChange,
}: {
  steps: Step[];
  onLoad: (steps: Step[], name: string) => void;
  entitlements?: ClientEntitlements | null;
  onAccountChange?: () => void;
}) {
  const [saved, setSaved] = useState<Workflow[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [cloud, setCloud] = useState<StoredWorkflow[] | null>(null);
  const [cloudLimit, setCloudLimit] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const nameId = useId();

  const signedIn = entitlements?.signedIn === true;
  const limit = entitlements?.limits.savedWorkflows ?? 0;
  const canCloud = signedIn && limit !== 0;

  useEffect(() => {
    const { workflows, available } = loadSavedWorkflows();
    setSaved(workflows);
    setStorageOk(available);
  }, []);

  const loadCloud = useCallback(async () => {
    if (!signedIn) {
      setCloud(null);
      return;
    }
    const r = await api<{ workflows: StoredWorkflow[]; limit: number }>("/api/workflows");
    if (r.ok) {
      setCloud(r.data.workflows);
      setCloudLimit(r.data.limit);
    } else setMessage(r.message);
  }, [signedIn]);

  useEffect(() => {
    void loadCloud();
  }, [loadCloud]);

  const withIds = (s: Step[]) => s.map((x) => ({ ...x, id: x.id ?? newStepId() }));

  const saveLocal = () => {
    const wf = makeWorkflow(name || "My workflow", steps);
    const next = upsertWorkflow(saved, wf);
    if (storeWorkflows(next)) {
      setSaved(next);
      setMessage(`Saved "${wf.name}" in this browser.`);
    } else {
      setStorageOk(false);
      setMessage("This browser blocked local storage. Use Export to keep the workflow as a file.");
    }
  };

  /** Saves to the account: updates a same-named unlocked workflow, otherwise creates one. */
  const saveCloud = async (wfName: string, wfSteps: Step[], quiet = false): Promise<boolean> => {
    const problems = workflowProblems(wfSteps);
    if (problems.length) {
      setMessage(`Not saved: ${problems[0]}`);
      return false;
    }
    const existing = cloud?.find((w) => w.name.toLowerCase() === wfName.trim().toLowerCase());
    const body = JSON.stringify({ name: wfName.trim(), steps: wfSteps, ...(existing ? { expectedVersion: existing.version } : {}) });
    const r = existing
      ? await api<{ workflow: StoredWorkflow }>(`/api/workflows/${existing.id}`, { method: "PUT", body })
      : await api<{ workflow: StoredWorkflow }>("/api/workflows", { method: "POST", body });
    if (!r.ok) {
      setMessage(r.message);
      return false;
    }
    if (!quiet) setMessage(`Saved "${r.data.workflow.name}" to your account.`);
    await loadCloud();
    onAccountChange?.();
    return true;
  };

  const importToAccount = async (list: Workflow[]) => {
    setBusy(true);
    let ok = 0;
    for (const wf of list) {
      if (await saveCloud(wf.name, wf.steps, true)) ok++;
      else break;
    }
    setBusy(false);
    if (ok) setMessage(`Imported ${ok} workflow${ok === 1 ? "" : "s"} to your account. They are still in this browser too.`);
  };

  const deleteCloud = async (wf: StoredWorkflow) => {
    const r = await api<void>(`/api/workflows/${wf.id}`, { method: "DELETE" });
    setMessage(r.ok ? `Deleted "${wf.name}" from your account.` : r.message);
    await loadCloud();
    onAccountChange?.();
  };

  const exportWf = (wf: Workflow) => downloadBlob(JSON.stringify(wf, null, 2), `${fileSafe(wf.name)}.datapolish.json`, MIME.json);
  const exportStored = (wf: StoredWorkflow) => exportWf({ app: "datapolish", version: 1, name: wf.name, savedAt: wf.updatedAt, steps: wf.steps });

  const importFile = async (file: File) => {
    if (file.size > 512 * 1024) {
      setMessage("That file is too large to be a workflow.");
      return;
    }
    const res = parseWorkflow(await file.text());
    if (!res.ok) {
      setMessage(`Could not import: ${res.errors.join("; ")}`);
      return;
    }
    onLoad(withIds(res.workflow.steps), res.workflow.name);
    const next = upsertWorkflow(saved, res.workflow);
    if (storeWorkflows(next)) setSaved(next);
    setMessage(`Imported and applied "${res.workflow.name}".`);
  };

  const effectiveLimit = cloud ? cloudLimit : limit;
  const lockedCount = cloud?.filter((w) => w.locked).length ?? 0;

  return (
    <section aria-labelledby="wf-heading" className="border border-rule bg-surface">
      <div className="border-b border-rule px-3 py-2">
        <h2 id="wf-heading" className="text-sm font-semibold">
          Saved workflows
        </h2>
        <p className="text-[12px] text-ink-3">
          A workflow is the list of steps, not your data. Literal text you type into steps (find &amp; replace values, column names) is saved with it.
        </p>
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="flex gap-2">
          <label htmlFor={nameId} className="sr-only">
            Workflow name
          </label>
          <input id={nameId} className="field" placeholder="Workflow name, e.g. Monthly orders" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={saveLocal} disabled={steps.length === 0}>
            Save in this browser
          </button>
          {canCloud && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void saveCloud(name || "My workflow", steps)} disabled={steps.length === 0 || busy}>
              Save to account
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => exportWf(makeWorkflow(name || "My workflow", steps))} disabled={steps.length === 0}>
            Export as JSON
          </button>
          <button type="button" className="btn btn-sm" onClick={() => importRef.current?.click()}>
            Import JSON…
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import workflow JSON file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {!storageOk && <p className="text-[12px] text-del-ink">Local storage is unavailable here (private mode or blocked). Export/import still works.</p>}
        <p className="min-h-4 text-[12px] text-ink-2" aria-live="polite">
          {message}
        </p>

        {signedIn && (
          <div className="border-t border-rule pt-2">
            <h3 className="text-[13px] font-semibold">
              In your account{" "}
              {cloud && (
                <span className="font-mono text-[11px] font-normal text-ink-3">
                  {cloud.length}/{formatLimit(effectiveLimit)}
                </span>
              )}
            </h3>
            {limit === 0 && (
              <p className="text-[12px] text-ink-2">
                Your plan ({entitlements?.planName}) keeps workflows in this browser only.{" "}
                <Link href="/pricing" className="text-accent underline" onClick={() => track("upgrade_clicked", { from: "workflows", plan: "pro" })}>
                  Pro and Business
                </Link>{" "}
                save them to your account.
              </p>
            )}
            {lockedCount > 0 && (
              <p className="mt-1 text-[12px] text-del-ink">
                {lockedCount} workflow{lockedCount === 1 ? " is" : "s are"} over your plan&rsquo;s limit and read-only. They were kept, not deleted: apply, export or delete them, or upgrade to edit.
              </p>
            )}
            {cloud && cloud.length > 0 && (
              <ul className="mt-1 divide-y divide-rule">
                {cloud.map((wf) => (
                  <li key={wf.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {wf.name}
                        {wf.locked && <span className="ml-1 text-[11px] font-normal text-del-ink">(read-only)</span>}
                      </span>
                      <span className="block font-mono text-[11px] text-ink-3">
                        {wf.steps.length} steps · v{wf.version} · {wf.updatedAt.slice(0, 10)}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          onLoad(withIds(wf.steps), wf.name);
                          setName(wf.name);
                          setMessage(`Applied "${wf.name}".`);
                        }}
                      >
                        Apply
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => exportStored(wf)} aria-label={`Export ${wf.name} from account`}>
                        ⤓
                      </button>
                      <button type="button" className="btn btn-sm" aria-label={`Delete ${wf.name} from account`} onClick={() => void deleteCloud(wf)}>
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {saved.length > 0 && (
          <div className="border-t border-rule pt-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">In this browser</h3>
              {canCloud && (
                <button type="button" className="text-[12px] text-accent underline" onClick={() => void importToAccount(saved)} disabled={busy}>
                  Import all to my account
                </button>
              )}
            </div>
            <ul className="mt-1 divide-y divide-rule">
              {saved.map((wf) => (
                <li key={wf.name} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{wf.name}</span>
                    <span className="block font-mono text-[11px] text-ink-3">
                      {wf.steps.length} steps{wf.savedAt ? ` · ${wf.savedAt.slice(0, 10)}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        onLoad(withIds(wf.steps), wf.name);
                        setName(wf.name);
                        setMessage(`Applied "${wf.name}".`);
                      }}
                    >
                      Apply
                    </button>
                    {canCloud && (
                      <button type="button" className="btn btn-sm" onClick={() => void importToAccount([wf])} disabled={busy} aria-label={`Import ${wf.name} to my account`}>
                        ↑
                      </button>
                    )}
                    <button type="button" className="btn btn-sm" onClick={() => exportWf(wf)} aria-label={`Export ${wf.name}`}>
                      ⤓
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-label={`Delete ${wf.name}`}
                      onClick={() => {
                        const next = saved.filter((w) => w !== wf);
                        storeWorkflows(next);
                        setSaved(next);
                        setMessage(`Deleted "${wf.name}".`);
                      }}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!signedIn && (
          <p className="text-[12px] text-ink-3">
            <Link href="/login" className="text-accent underline">
              Sign in
            </Link>{" "}
            to keep workflows in your account (Pro and Business).
          </p>
        )}
      </div>
    </section>
  );
}
