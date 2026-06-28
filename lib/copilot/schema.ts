import { z } from "zod";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    schema.optional(),
  );

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

export const copilotProfileSchema = z.object({
  sat_score: optionalNumber(z.number().int().min(400).max(1600)),
  act_score: optionalNumber(z.number().int().min(1).max(36)),
  gpa: optionalNumber(z.number().min(0).max(5)),
  application_round: z.enum(["regular", "early"]).default("regular"),
  intended_major: optionalText(160),
  activity_context: optionalText(800),
});

export const copilotSchoolSchema = z
  .object({
    unitid: z.number().int(),
    name: z.string().trim().min(1).max(240),
    country: z.string().trim().max(4).nullable().optional(),
    setting: z.string().trim().max(32).nullable().optional(),
    size: z.number().int().nullable().optional(),
    admit_rate: z.number().nullable().optional(),
    ed_admit_rate: z.number().nullable().optional(),
    rd_admit_rate: z.number().nullable().optional(),
    sat_25: z.number().int().nullable().optional(),
    sat_75: z.number().int().nullable().optional(),
    act_25: z.number().int().nullable().optional(),
    act_75: z.number().int().nullable().optional(),
    gpa_avg: z.number().nullable().optional(),
    test_policy: z.string().trim().max(32).nullable().optional(),
    c7_factors: z.record(z.string(), z.unknown()).nullable().optional(),
    selectivity_tier: z.string().trim().max(64).nullable().optional(),
    program_areas: z.array(z.string()).nullable().optional(),
    programs: z.array(z.string()).nullable().optional(),
    net_price_avg: z.number().nullable().optional(),
    sticker_cost: z.number().nullable().optional(),
    similarity: z.number().nullable().optional(),
  })
  .passthrough();

const statusSchema = z.enum(["todo", "in_progress", "done"]);

export const copilotActionSchema = z.object({
  type: z.literal("requirement_status"),
  unitid: z.number().int(),
  program_requirement_id: z.string().uuid().nullable().optional(),
  requirement_key: z.string().trim().min(1).max(240),
  status: statusSchema,
  source_url: z.string().url().nullable().optional(),
});

const commandCenterContextSchema = z.object({
  schools: z.array(copilotSchoolSchema).max(20).default([]),
  program_requirements: z.array(z.record(z.string(), z.unknown())).max(80).default([]),
  deadlines: z.array(z.record(z.string(), z.unknown())).max(80).default([]),
  statuses: z.array(z.record(z.string(), z.unknown())).max(120).optional(),
  documents: z.array(z.record(z.string(), z.unknown())).max(120).optional(),
});

const studentsLikeYouContextSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(80),
  model: z.string().trim().min(1).max(120),
  dim: z.number().int().min(1).max(4096),
});

const compassContextSchema = z.object({
  majors: z.array(z.record(z.string(), z.unknown())).max(200).default([]),
  careers: z.array(z.record(z.string(), z.unknown())).max(400).default([]),
  student_interests: optionalText(400),
  major_similarity: z.record(z.string(), z.number()).optional(),
  school: copilotSchoolSchema.optional(),
});

export const copilotToolContextSchema = z.object({
  students_like_you: studentsLikeYouContextSchema.optional(),
  command_center: commandCenterContextSchema.optional(),
  compass: compassContextSchema.optional(),
});

export const copilotRequestSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  profile: copilotProfileSchema.optional(),
  schools: z.array(copilotSchoolSchema).max(12).default([]),
  interests: optionalText(800),
  tool_context: copilotToolContextSchema.optional(),
  action: copilotActionSchema.optional(),
});

export type CopilotRequestInput = z.infer<typeof copilotRequestSchema>;
export type CopilotActionInput = z.infer<typeof copilotActionSchema>;
export type CopilotProfileInput = z.infer<typeof copilotProfileSchema>;

export function formatValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}
