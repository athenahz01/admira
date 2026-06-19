import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "./embedding-model";
import { embedFitDocuments } from "./embed-query";
import type { FitSchoolCandidate } from "./matching";
import type { FitRequest } from "./schema";

export const FIT_SCORE_AXIS_KEYS = [
  "academics",
  "major",
  "selectivity",
  "interest",
  "rigor",
] as const;
export const FIT_SCORE_METHOD = "equal_weight_known_axis_mean";
export const TYPICAL_ADMIT_RADAR_VALUE = 84;

type FitAxisKey = (typeof FIT_SCORE_AXIS_KEYS)[number];
type FitAxisStatus = "good" | "caution" | "unknown";

export type FitScoreAxis = {
  key: FitAxisKey;
  label: string;
  value: number | null;
  typical: number;
  status: FitAxisStatus;
  note: string;
};

export type FitScore = {
  score: number | null;
  axes: FitScoreAxis[];
  coverage: {
    known: number;
    total: number;
    label: string;
    reduced: boolean;
  };
  method: typeof FIT_SCORE_METHOD;
  model: {
    id: typeof EMBEDDING_MODEL_ID;
    dim: typeof EMBEDDING_DIM;
  };
  note: string;
};

type AxisBuildResult = Omit<FitScoreAxis, "typical">;

const AXIS_LABELS: Record<FitAxisKey, string> = {
  academics: "Academics",
  major: "Major",
  selectivity: "Selectivity",
  interest: "Interest",
  rigor: "Rigor",
};

const TIER_EXPECTED_STRENGTH: Record<string, number> = {
  accessible: 58,
  selective: 68,
  highly_selective: 78,
  elite: 88,
};

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function axisStatus(value: number | null): FitAxisStatus {
  if (value === null) {
    return "unknown";
  }
  return value >= 70 ? "good" : "caution";
}

function unknownAxis(key: FitAxisKey, note: string): AxisBuildResult {
  return {
    key,
    label: AXIS_LABELS[key],
    value: null,
    status: "unknown",
    note,
  };
}

function scoreFromBand(score: number | undefined, low: unknown, high: unknown) {
  const lowNumber = finiteNumber(low);
  const highNumber = finiteNumber(high);
  if (
    score === undefined ||
    lowNumber === null ||
    highNumber === null ||
    highNumber <= lowNumber
  ) {
    return null;
  }

  const mid = (lowNumber + highNumber) / 2;
  const scale = Math.max((highNumber - lowNumber) / 1.349, 1);
  const gap = (score - mid) / scale;
  return clampScore(72 + gap * 22);
}

function scoreFromAverage(score: number | undefined, average: unknown) {
  const averageNumber = finiteNumber(average);
  if (score === undefined || averageNumber === null) {
    return null;
  }

  const gap = (score - averageNumber) / 0.35;
  return clampScore(72 + gap * 22);
}

function ratingStrength(value: unknown) {
  switch (value) {
    case "Very Important":
      return 92;
    case "Important":
      return 82;
    case "Considered":
      return 70;
    case "Not Considered":
      return 55;
    default:
      return null;
  }
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length || left.length !== EMBEDDING_DIM) {
    return null;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return null;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function similarityToScore(similarity: unknown) {
  const value = finiteNumber(similarity);
  if (value === null) {
    return null;
  }
  return clampScore(Math.max(0, Math.min(1, value)) * 100);
}

function textParts(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

function cleanProgramAreas(programAreas: string[] | null) {
  if (!programAreas || programAreas.length === 0) {
    return [];
  }

  return [...new Set(programAreas.map((area) => area.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function academicAxis(input: FitRequest, school: FitSchoolCandidate) {
  const scores = [
    scoreFromBand(input.sat_score, school.sat_25, school.sat_75),
    scoreFromBand(input.act_score, school.act_25, school.act_75),
    scoreFromAverage(input.gpa, school.gpa_avg),
  ].filter((value): value is number => value !== null);

  if (scores.length === 0) {
    return unknownAxis(
      "academics",
      "No GPA or submitted test score could be compared with public admitted-student bands.",
    );
  }

  const value = clampScore(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
  return {
    key: "academics" as const,
    label: AXIS_LABELS.academics,
    value,
    status: axisStatus(value),
    note:
      "GPA and submitted test scores are compared with the school's public middle 50 or average.",
  };
}

async function majorAxis(input: FitRequest, school: FitSchoolCandidate) {
  const programAreas = cleanProgramAreas(school.program_areas);
  const majorText = textParts(input.intended_major, input.interests).join(". ");

  if (!majorText) {
    return unknownAxis(
      "major",
      "No intended major or interest text was provided for program overlap.",
    );
  }
  if (programAreas.length === 0) {
    return unknownAxis(
      "major",
      "This school has no program areas loaded for program overlap.",
    );
  }

  try {
    const [studentVector, programVector] = await embedFitDocuments([
      `Student major interests: ${majorText}.`,
      `School program areas: ${programAreas.join(", ")}.`,
    ]);
    const similarity = cosineSimilarity(studentVector, programVector);
    const value = similarityToScore(similarity);
    if (value === null) {
      return unknownAxis("major", "Program overlap could not be computed.");
    }

    return {
      key: "major" as const,
      label: AXIS_LABELS.major,
      value,
      status: axisStatus(value),
      note: `Program overlap uses ${EMBEDDING_MODEL_ID} in the same ${EMBEDDING_DIM}-dimensional space as Fit Finder.`,
    };
  } catch {
    return unknownAxis("major", "Program overlap embedding was unavailable.");
  }
}

function interestAxis(input: FitRequest, school: FitSchoolCandidate) {
  const interestText = textParts(input.interests, input.learning_style_notes).join(
    ". ",
  );
  if (!interestText) {
    return unknownAxis(
      "interest",
      "No interest or learning-note text was provided for school-document overlap.",
    );
  }

  const value = similarityToScore(school.similarity);
  if (value === null) {
    return unknownAxis(
      "interest",
      "The school-document similarity was not returned by the fit search.",
    );
  }

  return {
    key: "interest" as const,
    label: AXIS_LABELS.interest,
    value,
    status: axisStatus(value),
    note: "Interest overlap uses the school document similarity from the pinned Fit Finder embedding search.",
  };
}

function selectivityAxis(
  school: FitSchoolCandidate,
  academic: AxisBuildResult,
) {
  if (academic.value === null) {
    return unknownAxis(
      "selectivity",
      "Selectivity alignment needs an academic signal first.",
    );
  }

  const expected =
    TIER_EXPECTED_STRENGTH[school.selectivity_tier ?? ""] ?? null;
  if (expected === null) {
    return unknownAxis(
      "selectivity",
      "This school has no selectivity tier loaded.",
    );
  }

  const shortfall = Math.max(0, expected - academic.value);
  const surplus = Math.max(0, academic.value - expected);
  const value = clampScore(100 - shortfall * 1.55 - surplus * 0.18);
  return {
    key: "selectivity" as const,
    label: AXIS_LABELS.selectivity,
    value,
    status: axisStatus(value),
    note: `Academic strength is compared with the ${school.selectivity_tier?.replace(/_/g, " ") ?? "loaded"} selectivity tier.`,
  };
}

function rigorAxis(school: FitSchoolCandidate, academic: AxisBuildResult) {
  if (academic.value === null) {
    return unknownAxis(
      "rigor",
      "No transcript rigor field is sent in this flow, and no academic proxy was available.",
    );
  }

  const c7Rigor = school.c7_factors?.rigor;
  const rating = ratingStrength(c7Rigor);
  const value = clampScore(
    rating === null
      ? academic.value * 0.78
      : academic.value * 0.82 + rating * 0.18,
  );

  return {
    key: "rigor" as const,
    label: AXIS_LABELS.rigor,
    value,
    status: "caution" as const,
    note:
      "Thin proxy: Fit Finder does not receive a course-rigor field, so this uses academic signal plus the school's CDS rigor rating when available.",
  };
}

export async function computeFitScore(
  input: FitRequest,
  school: FitSchoolCandidate,
): Promise<FitScore> {
  const academics = academicAxis(input, school);
  const axesWithoutTypical = [
    academics,
    await majorAxis(input, school),
    selectivityAxis(school, academics),
    interestAxis(input, school),
    rigorAxis(school, academics),
  ];
  const axes = axesWithoutTypical.map((axis) => ({
    ...axis,
    typical: TYPICAL_ADMIT_RADAR_VALUE,
  }));
  const known = axes.filter((axis) => axis.value !== null);
  const score =
    known.length === 0
      ? null
      : clampScore(
          known.reduce((total, axis) => total + (axis.value ?? 0), 0) /
            known.length,
        );

  return {
    score,
    axes,
    coverage: {
      known: known.length,
      total: FIT_SCORE_AXIS_KEYS.length,
      label: `${known.length}/${FIT_SCORE_AXIS_KEYS.length} axes`,
      reduced: known.length < FIT_SCORE_AXIS_KEYS.length,
    },
    method: FIT_SCORE_METHOD,
    model: {
      id: EMBEDDING_MODEL_ID,
      dim: EMBEDDING_DIM,
    },
    note:
      "FIT is a profile-overlap score, not an admit probability. It is the equal-weight mean of known radar axes; unknown axes are excluded.",
  };
}
