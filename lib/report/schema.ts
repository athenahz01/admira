import { z } from "zod";

import { copilotProfileSchema, copilotSchoolSchema, copilotToolContextSchema } from "../copilot/schema";

const optionalText = (maxLength: number) =>
  z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(maxLength).optional());

export const reportRequestSchema = z.object({
  profile: copilotProfileSchema.optional(),
  schools: z.array(copilotSchoolSchema).max(12).default([]),
  interests: optionalText(800),
  title: optionalText(140),
  share: z.boolean().default(false),
  tool_context: copilotToolContextSchema.optional(),
});

export const reportExportRequestSchema = z.object({
  token: optionalText(140),
  report: z.record(z.string(), z.unknown()).optional(),
});

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;
export type ReportExportRequestInput = z.infer<typeof reportExportRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
