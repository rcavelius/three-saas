import { parseWorkflow, type Workflow } from "./engine/schema";

const KEY = "gridrinse.workflows.v1";
/** Key used before the product rename; read as a fallback so workflows saved earlier are not lost. */
const LEGACY_KEY = "datapolish.workflows.v1";

/** Workflows saved in this browser only. Every storage access is guarded: private mode or blocked storage must not break the app. */
export function loadSavedWorkflows(): { workflows: Workflow[]; available: boolean } {
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return { workflows: [], available: true };
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return { workflows: [], available: true };
    const workflows: Workflow[] = [];
    for (const item of list) {
      const res = parseWorkflow(item);
      if (res.ok) workflows.push(res.workflow);
    }
    return { workflows, available: true };
  } catch {
    return { workflows: [], available: false };
  }
}

export function storeWorkflows(workflows: Workflow[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(workflows));
    return true;
  } catch {
    return false;
  }
}

export function upsertWorkflow(list: Workflow[], wf: Workflow): Workflow[] {
  const others = list.filter((w) => w.name.toLowerCase() !== wf.name.toLowerCase());
  return [wf, ...others].slice(0, 30);
}
