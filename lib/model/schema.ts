import { z } from "zod";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema.optional());

export const chanceRequestSchema = z.object({
  unitid: z.number().int("unitid must be an integer"),
  sat_score: optionalNumber(
    z
      .number()
      .int("sat_score must be an integer")
      .min(400, "sat_score must be at least 400")
      .max(1600, "sat_score must be at most 1600"),
  ),
  act_score: optionalNumber(
    z
      .number()
      .int("act_score must be an integer")
      .min(1, "act_score must be at least 1")
      .max(36, "act_score must be at most 36"),
  ),
  gpa: optionalNumber(
    z
      .number()
      .min(0, "gpa must be at least 0")
      .max(5, "gpa must be at most 5"),
  ),
  application_round: z.enum(["regular", "early"]).default("regular"),
});

export type ChanceRequest = z.infer<typeof chanceRequestSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
