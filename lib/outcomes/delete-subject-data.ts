export type DeletedSubjectDataCounts = {
  consent_records: number;
  applicant_profiles: number;
  application_outcomes: number;
  data_access_logs: number;
};

type SubjectTable =
  | "consent_records"
  | "applicant_profiles"
  | "application_outcomes"
  | "data_access_logs";

type SupabaseResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type SupabaseDeleteResult = {
  error: { message: string } | null;
};

export type SupabaseSubjectDataClient = {
  from(table: SubjectTable): {
    select(columns: "id"): {
      eq(
        column: "subject_id",
        value: string,
      ): PromiseLike<SupabaseResult<{ id: string }>>;
    };
    delete(): {
      eq(
        column: "subject_id",
        value: string,
      ): PromiseLike<SupabaseDeleteResult>;
    };
  };
};

export const deletionReason =
  "subject requested hard deletion of consented modeling data";

async function countRows(
  supabase: SupabaseSubjectDataClient,
  table: SubjectTable,
  subjectId: string,
) {
  const result = await supabase
    .from(table)
    .select("id")
    .eq("subject_id", subjectId);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data?.length ?? 0;
}

async function deleteRows(
  supabase: SupabaseSubjectDataClient,
  table: SubjectTable,
  subjectId: string,
) {
  const result = await supabase
    .from(table)
    .delete()
    .eq("subject_id", subjectId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function deleteSubjectOutcomeData(
  supabase: SupabaseSubjectDataClient,
  subjectId: string,
  writeDeletedTombstone: (
    subjectId: string,
    rowCount: number,
    reason: string,
  ) => Promise<void>,
) {
  const deleted: DeletedSubjectDataCounts = {
    consent_records: await countRows(supabase, "consent_records", subjectId),
    applicant_profiles: await countRows(supabase, "applicant_profiles", subjectId),
    application_outcomes: await countRows(
      supabase,
      "application_outcomes",
      subjectId,
    ),
    data_access_logs: await countRows(supabase, "data_access_logs", subjectId),
  };
  const rowCount = Object.values(deleted).reduce((sum, count) => sum + count, 0);

  await deleteRows(supabase, "consent_records", subjectId);
  await deleteRows(supabase, "data_access_logs", subjectId);
  await writeDeletedTombstone(subjectId, rowCount, deletionReason);

  return deleted;
}
