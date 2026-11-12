import { z } from "zod";

const colList = z.array(z.string().max(200)).max(500);
const base = { id: z.string().max(64).optional(), enabled: z.boolean().default(true) };

export const TrimStep = z.object({
  ...base,
  type: z.literal("trim"),
  collapseInternal: z.boolean().default(true),
  removeInvisible: z.boolean().default(true),
  columns: colList.default([]),
});

export const RemoveBlankRowsStep = z.object({ ...base, type: z.literal("removeBlankRows") });

export const DedupeStep = z.object({
  ...base,
  type: z.literal("dedupe"),
  keys: colList.default([]),
  ignoreCase: z.boolean().default(false),
  ignoreWhitespace: z.boolean().default(true),
  keep: z.enum(["first", "last"]).default("first"),
});

export const HeadersStep = z.object({
  ...base,
  type: z.literal("normalizeHeaders"),
  style: z.enum(["keep", "snake", "title", "lower"]).default("keep"),
});

const DateOrderSchema = z.enum(["DMY", "MDY"]);

export const DatesStep = z.object({
  ...base,
  type: z.literal("formatDates"),
  columns: colList.nullable().default(null),
  order: z.enum(["auto", "DMY", "MDY"]).default("auto"),
  orderByColumn: z.record(z.string(), DateOrderSchema).default({}),
  outputFormat: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[YMD\s\-/.,:]+$/, "Use only Y, M, D tokens with - / . , : or spaces")
    .default("YYYY-MM-DD"),
  excelSerials: z.boolean().default(false),
  keepTime: z.boolean().default(true),
  twoDigitYearPivot: z.number().int().min(0).max(100).default(50),
});

export const NumbersStep = z.object({
  ...base,
  type: z.literal("formatNumbers"),
  columns: colList.default([]),
  decimalComma: z.boolean().default(false),
  decimals: z.number().int().min(0).max(10).nullable().default(null),
  percent: z.enum(["keep", "number", "fraction"]).default("keep"),
  thousandsSeparator: z.boolean().default(false),
});

export const FindReplaceStep = z.object({
  ...base,
  type: z.literal("findReplace"),
  find: z.string().min(1).max(300),
  replace: z.string().max(1000).default(""),
  regex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  wholeCell: z.boolean().default(false),
  columns: colList.default([]),
});

export const RenameStep = z.object({
  ...base,
  type: z.literal("renameColumns"),
  map: z.record(z.string().max(200), z.string().max(200)),
});

export const ReorderStep = z.object({ ...base, type: z.literal("reorderColumns"), order: colList });

export const DropStep = z.object({ ...base, type: z.literal("dropColumns"), columns: colList });

export const MergeColumnsStep = z.object({
  ...base,
  type: z.literal("mergeColumns"),
  columns: colList.min(2),
  separator: z.string().max(20).default(" "),
  into: z.string().max(200).default(""),
  keepOriginals: z.boolean().default(false),
  skipEmpty: z.boolean().default(true),
});

export const SplitColumnStep = z.object({
  ...base,
  type: z.literal("splitColumn"),
  column: z.string().max(200),
  separator: z.string().min(1).max(20),
  into: colList.min(2),
  keepOriginal: z.boolean().default(false),
});

export const StepSchema = z.discriminatedUnion("type", [
  TrimStep,
  RemoveBlankRowsStep,
  DedupeStep,
  HeadersStep,
  DatesStep,
  NumbersStep,
  FindReplaceStep,
  RenameStep,
  ReorderStep,
  DropStep,
  MergeColumnsStep,
  SplitColumnStep,
]);

export type Step = z.output<typeof StepSchema>;
export type StepInput = z.input<typeof StepSchema>;
export type StepType = Step["type"];
export type StepOf<T extends StepType> = Extract<Step, { type: T }>;

export const WORKFLOW_VERSION = 1;

/**
 * Workflow files and browser-saved workflows written before the product rename carry the old app id;
 * they are still accepted and normalised to "gridrinse" so nobody loses a saved workflow.
 */
const LEGACY_WORKFLOW_APP = "datapolish";

export const WorkflowSchema = z.object({
  app: z.enum(["gridrinse", LEGACY_WORKFLOW_APP]).transform((): "gridrinse" => "gridrinse"),
  version: z.literal(WORKFLOW_VERSION),
  name: z.string().trim().min(1).max(100),
  savedAt: z.string().max(40).optional(),
  steps: z.array(StepSchema).max(50),
});

export type Workflow = z.output<typeof WorkflowSchema>;

export type ParseWorkflowResult = { ok: true; workflow: Workflow } | { ok: false; errors: string[] };

/** Validate a workflow from untrusted JSON (a file or localStorage). Never throws. */
export function parseWorkflow(input: unknown): ParseWorkflowResult {
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, errors: ["The file is not valid JSON."] };
    }
  }
  if (data && typeof data === "object" && "version" in data && typeof (data as { version: unknown }).version === "number" && (data as { version: number }).version > WORKFLOW_VERSION) {
    return { ok: false, errors: [`This workflow was saved by a newer version (v${(data as { version: number }).version}). This app reads v${WORKFLOW_VERSION}.`] };
  }
  const res = WorkflowSchema.safeParse(data);
  if (res.success) return { ok: true, workflow: res.data };
  return { ok: false, errors: res.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

export function makeWorkflow(name: string, steps: Step[]): Workflow {
  return { app: "gridrinse", version: WORKFLOW_VERSION, name: name.trim() || "Untitled workflow", savedAt: new Date().toISOString(), steps };
}

/** Parse and fill defaults for one step (throws on invalid input). */
export function makeStep(input: StepInput): Step {
  return StepSchema.parse(input);
}

export const DESTRUCTIVE_STEPS: ReadonlySet<StepType> = new Set(["removeBlankRows", "dedupe", "dropColumns"]);

export function isDestructive(step: Step): boolean {
  if (DESTRUCTIVE_STEPS.has(step.type)) return true;
  if (step.type === "mergeColumns") return !step.keepOriginals;
  if (step.type === "splitColumn") return !step.keepOriginal;
  return false;
}
