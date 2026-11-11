import { z } from "zod";
import { CAPTURE_METHODS, RESPONSE_CONTENT_TYPES } from "./types";
import { limits, PLANS } from "./plans";

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

const byteLength = (s: string) => new TextEncoder().encode(s).byteLength;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name cannot be empty")
  .max(limits.nameMaxLength)
  .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Name cannot contain control characters");

export const customResponseSchema = z
  .object({
    status: z.number().int().min(200).max(599),
    contentType: z.enum(RESPONSE_CONTENT_TYPES),
    body: z.string().nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const body = v.body ?? "";
    if (byteLength(body) > limits.responseBodyMaxBytes) {
      ctx.addIssue({ code: "custom", path: ["body"], message: `Body must be at most ${limits.responseBodyMaxBytes} bytes` });
    }
    if (v.contentType === "application/json" && body.trim() !== "") {
      try {
        JSON.parse(body);
      } catch {
        ctx.addIssue({ code: "custom", path: ["body"], message: "Body must be valid JSON for application/json" });
      }
    }
    if (NULL_BODY_STATUSES.has(v.status) && body !== "") {
      ctx.addIssue({ code: "custom", path: ["body"], message: `Status ${v.status} cannot have a body` });
    }
  });

export type CustomResponseInput = z.infer<typeof customResponseSchema>;

export const createEndpointSchema = z.object({ name: nameSchema.optional() }).strict();

export const updateEndpointSchema = z
  .object({
    name: nameSchema.optional(),
    /** New expiry = now + hours (capped by the plan's lifetime limit). */
    expiresInHours: z.number().int().min(1).max(PLANS.free.retentionHours).optional(),
    /** null resets to the default response. */
    response: customResponseSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.expiresInHours !== undefined || v.response !== undefined, "Nothing to update");

const cursor = z.string().regex(/^\d{1,18}$/, "Invalid cursor");

export const listRequestsQuerySchema = z
  .object({
    method: z.enum(CAPTURE_METHODS).optional(),
    q: z.string().trim().min(1).max(200).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    before: cursor.optional(),
    after: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((v) => !(v.before && v.after), "Use either before or after, not both");

export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

export function searchParamsToObject(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp) if (v !== "") out[k] = v;
  return out;
}
