import { z } from "zod";

const forbiddenKeyPattern = /^(race|ethnicity|ethnic_origin|racial_identity)$/i;

export function assertNoForbiddenDemographicKeys(value: unknown, path = "body") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenDemographicKeys(item, `${path}[${index}]`),
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value).forEach(([key, nested]) => {
    if (forbiddenKeyPattern.test(key)) {
      throw new Error(`${path}.${key} is never collected, stored, logged, or modeled.`);
    }
    assertNoForbiddenDemographicKeys(nested, `${path}.${key}`);
  });
}

const uuid = z.string().uuid();
const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null || value === "" ? undefined : value), schema.optional());

export const consentSchema = z
  .object({
    consent_version: z.string().min(1).max(64),
    consent_text: z.string().min(40).max(5000),
    purpose: z.literal("real_outcome_modeling").default("real_outcome_modeling"),
  })
  .strict();

export const applicantProfileSchema = z
  .object({
    consent_record_id: uuid,
    cycle_year: z.number().int().min(2020).max(2100),
    gpa: optionalNumber(z.number().min(0).max(5)),
    course_rigor: z
      .enum(["standard", "honors", "ap_ib_dual", "most_rigorous", "unknown"])
      .nullable()
      .optional(),
    sat_score: optionalNumber(z.number().int().min(400).max(1600)),
    act_score: optionalNumber(z.number().int().min(1).max(36)),
    test_submitted: z.boolean().default(true),
    activities_tier: z
      .enum(["none", "school", "regional", "state", "national", "unknown"])
      .nullable()
      .optional(),
    intended_major: z.string().trim().min(1).max(120).nullable().optional(),
    application_round: z.enum(["regular", "early"]).default("regular"),
    demonstrated_interest: z
      .enum(["none", "light", "moderate", "strong", "unknown"])
      .nullable()
      .optional(),
  })
  .strict();

export const applicationOutcomeSchema = z
  .object({
    profile_id: uuid,
    consent_record_id: uuid,
    unitid: z.number().int(),
    outcome: z.enum(["admitted", "denied", "waitlisted", "deferred"]),
    application_round: z.enum(["regular", "early"]),
    cycle_year: z.number().int().min(2020).max(2100),
  })
  .strict();

export type ConsentInput = z.infer<typeof consentSchema>;
export type ApplicantProfileInput = z.infer<typeof applicantProfileSchema>;
export type ApplicationOutcomeInput = z.infer<typeof applicationOutcomeSchema>;
