"use client";

import { useEffect, useId, useRef, useState } from "react";
import { downloadBlob, MIME } from "@/lib/download";
import { makeWorkflow, parseWorkflow, type Step, type Workflow } from "@/lib/engine/schema";
import { newStepId } from "@/lib/steps";
import { loadSavedWorkflows, storeWorkflows, upsertWorkflow } from "@/lib/workflowStore";

function fileSafe(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "workflow";
}

export function WorkflowPanel({ steps, onLoad }: { steps: Step[]; onLoad: (steps: Step[], name: string) => void }) {
  const [saved, setSaved] = useState<Workflow[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const nameId = useId();

  useEffect(() => {
    const { workflows, available } = loadSavedWorkflows();
    setSaved(workflows);
    setStorageOk(available);
  }, []);

  const withIds = (s: Step[]) => s.map((x) => ({ ...x, id: x.id ?? newStepId() }));

  const save = () => {
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

  const exportWf = (wf: Workflow) => downloadBlob(JSON.stringify(wf, null, 2), `${fileSafe(wf.name)}.datapolish.json`, MIME.json);

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

  return (
    <section aria-labelledby="wf-heading" className="border border-rule bg-surface">
      <div className="border-b border-rule px-3 py-2">
        <h2 id="wf-heading" className="text-sm font-semibold">
          Saved workflows
        </h2>
        <p className="text-[12px] text-ink-3">Save these steps to reuse on next month&rsquo;s export. Stored in this browser only; account sync comes with paid plans.</p>
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="flex gap-2">
          <label htmlFor={nameId} className="sr-only">
            Workflow name
          </label>
          <input id={nameId} className="field" placeholder="Workflow name, e.g. Monthly orders" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <button type="button" className="btn btn-sm" onClick={save} disabled={steps.length === 0}>
            Save
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
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
        {saved.length > 0 && (
          <ul className="divide-y divide-rule border-t border-rule">
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
        )}
      </div>
    </section>
  );
}
