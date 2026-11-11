/**
 * Rules for workflows stored in an account (server) — shared with the browser so it can explain a
 * rejection before sending anything.
 *
 * A workflow is a list of cleaning steps, never cell data. Steps can still contain LITERAL values the
 * user typed: find & replace text, column names, separators, merge/split targets. Those literals are
 * stored as typed (documented in the privacy page and README). To keep pasted cell contents out of
 * the database, find/replace values are capped at 1 KB each (UTF-8) and a whole pipeline at 32 KB.
 */
import { z } from "zod";
import { StepSchema, type Step } from "./engine/schema";

export const MAX_FIND_REPLACE_BYTES = 1024;
export const MAX_PIPELINE_BYTES = 32 * 1024;
export const MAX_STEPS = 50;

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

export const StoredStepsSchema = z
  .array(StepSchema)
  .max(MAX_STEPS)
  .superRefine((steps, ctx) => {
    steps.forEach((s, i) => {
      if (s.type !== "findReplace") return;
      if (utf8Bytes(s.find) > MAX_FIND_REPLACE_BYTES) {
        ctx.addIssue({ code: "custom", path: [i, "find"], message: `Find text is longer than ${MAX_FIND_REPLACE_BYTES} bytes; workflows must not contain cell data.` });
      }
      if (utf8Bytes(s.replace) > MAX_FIND_REPLACE_BYTES) {
        ctx.addIssue({ code: "custom", path: [i, "replace"], message: `Replace text is longer than ${MAX_FIND_REPLACE_BYTES} bytes; workflows must not contain cell data.` });
      }
    });
    if (utf8Bytes(JSON.stringify(steps)) > MAX_PIPELINE_BYTES) {
      ctx.addIssue({ code: "custom", message: `The workflow is larger than ${MAX_PIPELINE_BYTES / 1024} KB.` });
    }
  });

export const WorkflowWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    steps: StoredStepsSchema,
    /** Optimistic concurrency for updates: the version the client last saw. */
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

export type WorkflowWrite = z.output<typeof WorkflowWriteSchema>;

/** Browser-side pre-check with the same rules (returns problems, empty when fine). */
export function workflowProblems(steps: Step[]): string[] {
  const r = StoredStepsSchema.safeParse(steps);
  return r.success ? [] : r.error.issues.slice(0, 5).map((i) => i.message);
}

/** What the API returns for a stored workflow. */
export interface StoredWorkflow {
  id: string;
  name: string;
  steps: Step[];
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Over the plan's savedWorkflows limit (e.g. after a downgrade): read-only, can be exported or deleted. */
  locked: boolean;
}
