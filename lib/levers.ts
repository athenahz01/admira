export type LeverKind = "controllable" | "fixed" | "unseen";

export type FeatureLever = {
  feature: string;
  lever: LeverKind;
  label: string;
  note?: string;
};

/*
 * These tags power the downstream lever map and disclosure UI. Phase 1 only
 * stores the metadata; later phases use it to separate movable choices from
 * locked profile context and factors Admira cannot observe from public data.
 */
export const featureLevers = [
  {
    feature: "test_score",
    lever: "controllable",
    label: "Test score",
    note: "Can still move if the student has another SAT or ACT sitting before application deadlines.",
  },
  {
    feature: "application_round",
    lever: "controllable",
    label: "Application round",
    note: "Early decision or early action strategy can change the school-specific odds context.",
  },
  {
    feature: "remaining_course_rigor",
    lever: "controllable",
    label: "Remaining course rigor",
    note: "Senior-year course choices may still be adjustable before schedules lock.",
  },
  {
    feature: "gpa_to_date",
    lever: "fixed",
    label: "GPA to date",
    note: "Most of the academic record is already set by application season.",
  },
  {
    feature: "state_residency",
    lever: "fixed",
    label: "State residency",
    note: "Public universities may weigh in-state context differently.",
  },
  {
    feature: "school_context",
    lever: "fixed",
    label: "High school context",
    note: "Course availability and school profile are treated as background context.",
  },
  {
    feature: "essays",
    lever: "unseen",
    label: "Essays",
    note: "Public data cannot evaluate writing quality or application narrative.",
  },
  {
    feature: "recommendations",
    lever: "unseen",
    label: "Recommendations",
    note: "Teacher and counselor letters are not visible in the public-data model.",
  },
  {
    feature: "institutional_priorities",
    lever: "unseen",
    label: "Institutional priorities",
    note: "Major balance, class-shaping needs, and yield goals are not directly observable.",
  },
  {
    feature: "demonstrated_interest",
    lever: "unseen",
    label: "Demonstrated interest",
    note: "Some schools consider engagement, but public data rarely captures student-specific evidence.",
  },
] satisfies FeatureLever[];

export const unseenFeatureLevers = featureLevers.filter(
  (featureLever) => featureLever.lever === "unseen",
);
