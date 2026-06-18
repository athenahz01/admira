import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  deleteSubjectOutcomeData,
  deletionReason,
} from "../delete-subject-data";
import {
  applicantProfileSchema,
  applicationOutcomeSchema,
  assertNoForbiddenDemographicKeys,
  consentSchema,
} from "../schemas";

describe("Phase 6 outcome privacy controls", () => {
  it("rejects race and ethnicity keys before parsing", () => {
    expect(() =>
      assertNoForbiddenDemographicKeys({ profile: { race: "never" } }),
    ).toThrow(/never collected/);
    expect(() =>
      assertNoForbiddenDemographicKeys({ profile: { ethnicity: "never" } }),
    ).toThrow(/never collected/);
  });

  it("accepts only minimized structured profile and outcome fields", () => {
    expect(
      consentSchema.parse({
        consent_version: "2026-06-17",
        consent_text:
          "I consent to Fitty storing my profile and outcomes for real-outcome model training.",
      }),
    ).toMatchObject({ purpose: "real_outcome_modeling" });

    expect(
      applicantProfileSchema.parse({
        consent_record_id: "00000000-0000-4000-8000-000000000001",
        cycle_year: 2026,
        gpa: 3.8,
        course_rigor: "ap_ib_dual",
        sat_score: 1450,
        act_score: 33,
        test_submitted: true,
        activities_tier: "state",
        intended_major: "Biology",
        application_round: "early",
        demonstrated_interest: "moderate",
      }),
    ).toMatchObject({ application_round: "early" });

    expect(
      applicationOutcomeSchema.parse({
        profile_id: "00000000-0000-4000-8000-000000000002",
        consent_record_id: "00000000-0000-4000-8000-000000000001",
        unitid: 166683,
        outcome: "waitlisted",
        application_round: "regular",
        cycle_year: 2026,
      }),
    ).toMatchObject({ outcome: "waitlisted" });
  });

  it("migration enables RLS and blocks storage without active consent", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "202606170001_phase6_outcome_capture.sql",
      ),
      "utf-8",
    ).toLowerCase();

    expect(migration).toContain("enable row level security");
    expect(migration).toContain("require_active_modeling_consent");
    expect(migration).toContain("revoked_at is null");
    expect(migration).toContain("on delete cascade");
    expect(migration).not.toContain(" race");
    expect(migration).not.toContain("ethnicity");
  });

  it("hard-delete leaves one retained deleted tombstone", async () => {
    const subjectId = "00000000-0000-4000-8000-000000000001";
    const otherSubjectId = "00000000-0000-4000-8000-000000000099";
    const tables = {
      consent_records: [
        { id: "consent-1", subject_id: subjectId },
        { id: "consent-other", subject_id: otherSubjectId },
      ],
      applicant_profiles: [{ id: "profile-1", subject_id: subjectId }],
      application_outcomes: [{ id: "outcome-1", subject_id: subjectId }],
      data_access_logs: [
        { id: "log-1", subject_id: subjectId, action: "profile_created" },
        { id: "log-other", subject_id: otherSubjectId, action: "exported" },
      ],
    };

    const fakeSupabase = {
      from(table: keyof typeof tables) {
        return {
          select() {
            return {
              async eq(_column: "subject_id", value: string) {
                return {
                  data: tables[table]
                    .filter((row) => row.subject_id === value)
                    .map((row) => ({ id: row.id })),
                  error: null,
                };
              },
            };
          },
          delete() {
            return {
              async eq(_column: "subject_id", value: string) {
                tables[table] = tables[table].filter(
                  (row) => row.subject_id !== value,
                ) as never;
                if (table === "consent_records") {
                  tables.applicant_profiles = tables.applicant_profiles.filter(
                    (row) => row.subject_id !== value,
                  );
                  tables.application_outcomes =
                    tables.application_outcomes.filter(
                      (row) => row.subject_id !== value,
                    );
                }
                return { error: null };
              },
            };
          },
        };
      },
    };

    const deleted = await deleteSubjectOutcomeData(
      fakeSupabase,
      subjectId,
      async (deletedSubjectId, rowCount, reason) => {
        tables.data_access_logs.push({
          id: "delete-tombstone",
          subject_id: deletedSubjectId,
          action: "deleted",
          row_count: rowCount,
          reason,
        } as never);
      },
    );

    expect(deleted).toEqual({
      consent_records: 1,
      applicant_profiles: 1,
      application_outcomes: 1,
      data_access_logs: 1,
    });
    expect(
      tables.consent_records.filter((row) => row.subject_id === subjectId),
    ).toHaveLength(0);
    expect(
      tables.applicant_profiles.filter((row) => row.subject_id === subjectId),
    ).toHaveLength(0);
    expect(
      tables.application_outcomes.filter((row) => row.subject_id === subjectId),
    ).toHaveLength(0);

    const subjectLogs = tables.data_access_logs.filter(
      (row) => row.subject_id === subjectId,
    );
    expect(subjectLogs).toHaveLength(1);
    expect(subjectLogs[0]).toMatchObject({
      action: "deleted",
      row_count: 4,
      reason: deletionReason,
      subject_id: subjectId,
    });
  });
});
