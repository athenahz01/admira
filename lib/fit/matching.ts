import type { FitRequest } from "./schema";
import { EMBEDDING_DIM } from "./embedding-model";
import type { InferenceSchool } from "../model/inference";
import { buildChancePayload } from "../model/inference";
import type { SchoolRegion, SchoolSizeBand, SelectivityTier } from "../types";

export const FIT_CANDIDATE_POOL_SIZE = 30;
export const FIT_RESULT_LIMIT = 12;

type BandLabel = "reach" | "target" | "likely";
type CostStatus = "within_ceiling" | "over_ceiling" | "unknown";

export type FitSchoolCandidate = InferenceSchool & {
  state: string | null;
  region: SchoolRegion | null;
  size_band: SchoolSizeBand | null;
  setting: "city" | "suburb" | "town" | "rural" | null;
  selectivity_tier: SelectivityTier | null;
  net_price_avg: number | null;
  sticker_cost: number | null;
  program_areas: string[] | null;
  median_earnings_10yr: number | null;
  completion_rate: number | null;
  similarity?: number | null;
};

export type FitResult = {
  school: {
    unitid: number;
    name: string;
    region: SchoolRegion | null;
    size_band: SchoolSizeBand | null;
    setting: "city" | "suburb" | "town" | "rural" | null;
    selectivity_tier: SelectivityTier | null;
    net_price_avg: number | null;
    sticker_cost: number | null;
    program_areas: string[] | null;
  };
  match_reasons: {
    matched: string[];
    notable: string[];
    cost_status: CostStatus;
  };
  probability: {
    point: number;
    calibrated: number;
    low: number;
    high: number;
    width: number;
    coverage: number;
  };
  band: {
    label: BandLabel;
    wide_band: boolean;
  };
};

export type FitBalance = Record<BandLabel, number> & {
  note: string;
};

const BAND_ORDER = ["reach", "target", "likely"] as const;
const STOPWORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "school",
  "schools",
  "college",
  "colleges",
  "program",
  "programs",
  "major",
  "majors",
  "style",
  "learning",
]);

export const FIT_DISCLAIMERS = [
  "Fit uses published attributes only; campus culture and social fit are not modeled.",
  "Affordability uses published net price or sticker cost. Merit aid is not predicted.",
  "Chances are calibrated ranges, not guarantees.",
];

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeToken(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized.length > 4 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function preferenceTokens(input: FitRequest) {
  const text = [
    input.interests,
    input.intended_major,
    input.learning_style_notes,
  ]
    .filter(Boolean)
    .join(" ");

  return new Set(
    text
      .split(/[^a-zA-Z0-9]+/)
      .map(normalizeToken)
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
  );
}

function programMatches(input: FitRequest, programAreas: string[] | null) {
  if (!programAreas || programAreas.length === 0) {
    return [];
  }

  const tokens = preferenceTokens(input);
  if (tokens.size === 0) {
    return [];
  }

  return [...programAreas]
    .sort((left, right) => left.localeCompare(right))
    .filter((program) => {
      const programTokens = program
        .split(/[^a-zA-Z0-9]+/)
        .map(normalizeToken)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
      return programTokens.some((token) => tokens.has(token));
    });
}

function costBasis(school: Pick<FitSchoolCandidate, "net_price_avg" | "sticker_cost">) {
  return toNumber(school.net_price_avg) ?? toNumber(school.sticker_cost);
}

export function schoolMatchesHardFilters(
  school: FitSchoolCandidate,
  input: FitRequest,
) {
  if (input.preferred_region && school.region !== input.preferred_region) {
    return false;
  }
  if (input.preferred_size && school.size_band !== input.preferred_size) {
    return false;
  }
  if (input.preferred_setting && school.setting !== input.preferred_setting) {
    return false;
  }
  if (input.cost_ceiling !== undefined) {
    const cost = costBasis(school);
    if (cost !== null && cost > input.cost_ceiling) {
      return false;
    }
  }

  return true;
}

export function costStatus(school: FitSchoolCandidate, input: FitRequest): CostStatus {
  if (input.cost_ceiling === undefined) {
    return "unknown";
  }

  const cost = costBasis(school);
  if (cost === null) {
    return "unknown";
  }

  return cost <= input.cost_ceiling ? "within_ceiling" : "over_ceiling";
}

export function buildMatchReasons(
  school: FitSchoolCandidate,
  input: FitRequest,
) {
  const matched = [];
  const notable = [];

  if (input.preferred_region && school.region === input.preferred_region) {
    matched.push("region");
  }
  if (input.preferred_size && school.size_band === input.preferred_size) {
    matched.push("size");
  }
  if (input.preferred_setting && school.setting === input.preferred_setting) {
    matched.push("setting");
  }

  const currentCostStatus = costStatus(school, input);
  if (currentCostStatus === "within_ceiling") {
    matched.push("cost within ceiling");
  }

  for (const program of programMatches(input, school.program_areas)) {
    matched.push(`programs: ${program.toLowerCase()}`);
  }

  const completion = toNumber(school.completion_rate);
  if (completion !== null) {
    notable.push(`completion ${completion.toFixed(2)}`);
  }

  const earnings = toNumber(school.median_earnings_10yr);
  if (earnings !== null) {
    notable.push(`median earnings 10yr ${Math.round(earnings)}`);
  }

  return {
    matched,
    notable,
    cost_status: currentCostStatus,
  };
}

export function vectorToSql(vector: readonly number[]) {
  if (
    vector.length !== EMBEDDING_DIM ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Query vector must have ${EMBEDDING_DIM} finite dimensions`);
  }

  return `[${vector.map((value) => value.toFixed(8)).join(",")}]`;
}

export function buildFitResult(
  candidate: FitSchoolCandidate,
  input: FitRequest,
): FitResult {
  const chance = buildChancePayload(
    {
      unitid: candidate.unitid,
      sat_score: input.sat_score,
      act_score: input.act_score,
      gpa: input.gpa,
      application_round: input.application_round,
    },
    candidate,
  );

  return {
    school: {
      unitid: candidate.unitid,
      name: candidate.name,
      region: candidate.region,
      size_band: candidate.size_band,
      setting: candidate.setting,
      selectivity_tier: candidate.selectivity_tier,
      net_price_avg: candidate.net_price_avg,
      sticker_cost: candidate.sticker_cost,
      program_areas: candidate.program_areas,
    },
    match_reasons: buildMatchReasons(candidate, input),
    probability: chance.probability,
    band: {
      label: chance.band.label,
      wide_band: chance.band.wide_band,
    },
  };
}

export function balanceFitResults(results: FitResult[], limit = FIT_RESULT_LIMIT) {
  const buckets = new Map<BandLabel, FitResult[]>(
    BAND_ORDER.map((label) => [label, []]),
  );

  for (const result of results) {
    buckets.get(result.band.label)?.push(result);
  }

  const selected: FitResult[] = [];
  while (selected.length < limit) {
    let added = false;
    for (const label of BAND_ORDER) {
      const next = buckets.get(label)?.shift();
      if (next) {
        selected.push(next);
        added = true;
        if (selected.length >= limit) {
          break;
        }
      }
    }
    if (!added) {
      break;
    }
  }

  const counts = {
    reach: selected.filter((result) => result.band.label === "reach").length,
    target: selected.filter((result) => result.band.label === "target").length,
    likely: selected.filter((result) => result.band.label === "likely").length,
  };
  const nonzero = BAND_ORDER.filter((label) => counts[label] > 0);

  let note = "Returned a balanced list where the candidate pool allowed it.";
  if (selected.length === 0) {
    note = "No schools matched the filters and embedded candidate pool.";
  } else if (nonzero.length === 1) {
    note = `All returned schools landed in ${nonzero[0]} based on the chancing ranges.`;
  } else if (nonzero.length < BAND_ORDER.length) {
    note = "Some chance bands were not present after filters and ranking.";
  }

  return {
    results: selected,
    balance: {
      ...counts,
      note,
    } satisfies FitBalance,
  };
}

export function buildBalancedFitResponse(
  candidates: FitSchoolCandidate[],
  input: FitRequest,
) {
  const filtered = candidates.filter((candidate) =>
    schoolMatchesHardFilters(candidate, input),
  );
  const ranked = filtered.map((candidate) => buildFitResult(candidate, input));
  return balanceFitResults(ranked);
}
