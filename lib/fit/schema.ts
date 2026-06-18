import { z } from "zod";

import { chanceRequestSchema, formatValidationError } from "../model/schema";

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

const fitProfileSchema = chanceRequestSchema.omit({ unitid: true });

const flattenedFitRequestSchema = z.object({
  interests: optionalText(800),
  intended_major: optionalText(160),
  preferred_size: z.enum(["small", "medium", "large"]).optional(),
  preferred_setting: z.enum(["city", "suburb", "town", "rural"]).optional(),
  preferred_region: z.enum(["Northeast", "Midwest", "South", "West"]).optional(),
  cost_ceiling: z
    .preprocess(
      (value) => (value === null || value === "" ? undefined : value),
      z.number().min(0, "cost_ceiling must be at least 0").optional(),
    ),
  learning_style_notes: optionalText(800),
  ...fitProfileSchema.shape,
});

export const fitRequestSchema = z.preprocess((body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  const preferences =
    record.preferences && typeof record.preferences === "object"
      ? (record.preferences as Record<string, unknown>)
      : {};
  const profile =
    record.profile && typeof record.profile === "object"
      ? (record.profile as Record<string, unknown>)
      : {};

  return {
    ...record,
    ...preferences,
    ...profile,
  };
}, flattenedFitRequestSchema).superRefine((value, context) => {
  if (!value.interests && !value.intended_major && !value.learning_style_notes) {
    context.addIssue({
      code: "custom",
      path: ["interests"],
      message:
        "Add interests, an intended major, or learning style notes before matching.",
    });
  }
});

export type FitRequest = z.infer<typeof fitRequestSchema>;

export { formatValidationError };
