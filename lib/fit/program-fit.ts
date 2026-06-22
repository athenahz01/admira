// Program/interest fit: a hybrid (keyword + semantic) signal that measures how
// well a school's actual fields of study match what the student asked for.
//
// This module is pure and framework-free (no server-only, no Supabase, no
// embedding runtime) so the live API (lib/fit/fit-score.ts, app/api/fit) and
// the offline evaluation (pipeline/eval_fit.ts) share one source of truth for
// ranking. The semantic similarity is supplied by the caller (cosine of the
// pinned embedding); this module only normalizes and blends it.

// Blend weights for the program-fit score. Keyword (lexical program-name)
// evidence is weighted higher than raw embedding similarity because a literal
// program match ("Public Policy Analysis" for "public policy") is the strongest
// signal we have; semantic similarity adds recall and breaks ties.
export const PROGRAM_FIT_WEIGHTS = { keyword: 0.6, semantic: 0.4 } as const;

// MiniLM cosine similarities for relevant query/school pairs typically land in
// ~0.15 to ~0.6 once the school document includes real program names. Map that
// window to 0..1 for blending. Documented and deterministic.
export const SEMANTIC_SIM_MIN = 0.15;
export const SEMANTIC_SIM_MAX = 0.6;

// A literal match in the specific program titles is full strength; a match only
// in the broad Scorecard program-area buckets is partial.
export const SPECIFIC_PROGRAM_WEIGHT = 1;
export const BROAD_AREA_WEIGHT = 0.6;

// Below this headline program-fit, the list is treated as a weak program match
// and surfaced honestly instead of presented as a strong recommendation.
export const PROGRAM_FIT_WEAK_THRESHOLD = 45;

export const PROGRAM_FIT_METHOD = "hybrid_keyword_semantic_program_fit_v1";

type ConceptGroup = { id: string; terms: string[] };

// Curated concept vocabulary. Each group lists the phrases a student might type,
// the phrases that appear in real CIP program titles (so "public policy" reaches
// "Public Affairs" / "Political Science" / "Public Administration"), AND the
// coarse Scorecard program-area bucket wording so matching still works before
// the human re-enriches with specific titles. This is the synonym handling
// called for by the brief. Order does not matter.
export const PROGRAM_CONCEPTS: ConceptGroup[] = [
  {
    id: "public_policy",
    terms: [
      "public policy",
      "public affairs",
      "public administration",
      "political science",
      "government",
      "policy analysis",
      "politics",
      "international relations",
      "international affairs",
      "social science",
    ],
  },
  {
    id: "economics",
    terms: [
      "economics",
      "econ",
      "political economy",
      "quantitative economics",
      "social science",
    ],
  },
  {
    id: "computer_science",
    terms: [
      "computer science",
      "computer",
      "computing",
      "information science",
      "informatics",
      "software",
      "artificial intelligence",
      "machine learning",
    ],
  },
  {
    id: "data_science",
    terms: ["data science", "data analytics", "statistics", "applied math"],
  },
  {
    id: "engineering",
    terms: [
      "engineering",
      "mechanical",
      "electrical",
      "civil engineering",
      "aerospace",
      "chemical engineering",
      "biomedical engineering",
      "industrial engineering",
      "materials",
    ],
  },
  {
    id: "business",
    terms: [
      "business",
      "management",
      "marketing",
      "finance",
      "accounting",
      "entrepreneurship",
      "supply chain",
      "operations",
    ],
  },
  {
    id: "psychology",
    terms: ["psychology", "cognitive science", "behavioral science"],
  },
  {
    id: "biology",
    terms: [
      "biology",
      "biological",
      "biochemistry",
      "molecular",
      "neuroscience",
      "pre-med",
      "premed",
      "physiology",
      "genetics",
    ],
  },
  {
    id: "chemistry",
    terms: ["chemistry", "chemical", "physical science"],
  },
  {
    id: "physics",
    terms: ["physics", "astronomy", "astrophysics", "physical science"],
  },
  {
    id: "mathematics",
    terms: ["mathematics", "math", "applied mathematics"],
  },
  {
    id: "english",
    terms: [
      "english",
      "writing",
      "creative writing",
      "literature",
      "rhetoric",
      "comparative literature",
    ],
  },
  {
    id: "history",
    terms: ["history", "historical"],
  },
  {
    id: "philosophy",
    terms: ["philosophy", "ethics", "logic", "religious studies"],
  },
  {
    id: "sociology",
    terms: ["sociology", "social work", "anthropology", "social science"],
  },
  {
    id: "environment",
    terms: [
      "environmental",
      "sustainability",
      "ecology",
      "earth science",
      "climate",
      "environmental science",
      "environmental studies",
      "natural resource",
    ],
  },
  {
    id: "art_design",
    terms: [
      "art",
      "design",
      "visual",
      "performing art",
      "fine arts",
      "graphic design",
      "studio art",
      "architecture",
    ],
  },
  {
    id: "music",
    terms: ["music", "musical", "composition", "performing art"],
  },
  {
    id: "theater_film",
    terms: [
      "theater",
      "theatre",
      "drama",
      "film",
      "cinema",
      "media arts",
      "performing art",
    ],
  },
  {
    id: "communications",
    terms: ["communication", "journalism", "media studies", "public relations"],
  },
  {
    id: "education",
    terms: ["education", "teaching", "elementary education"],
  },
  {
    id: "health",
    terms: [
      "nursing",
      "health",
      "public health",
      "kinesiology",
      "nutrition",
      "health sciences",
      "allied health",
    ],
  },
  {
    id: "criminal_justice",
    terms: [
      "criminal justice",
      "criminology",
      "law enforcement",
      "security",
    ],
  },
  {
    id: "linguistics",
    terms: ["linguistics", "languages", "foreign language"],
  },
];

const QUERY_STOPWORDS = new Set([
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
  "minor",
  "study",
  "studies",
  "interested",
  "interest",
  "interests",
  "want",
  "like",
  "love",
  "really",
  "maybe",
]);

export function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function adHocConcepts(normalizedQuery: string): ConceptGroup[] {
  return [...new Set(normalizedQuery.split(" "))]
    .filter((token) => token.length >= 4 && !QUERY_STOPWORDS.has(token))
    .map((token) => ({ id: `adhoc:${token}`, terms: [token] }));
}

// Which concepts the student's interests + major activate. Curated groups win;
// if none activate (an unusual interest), fall back to ad-hoc query tokens so
// matching still degrades gracefully.
export function queryConcepts(queryText: string): ConceptGroup[] {
  const normalized = normalizeForMatch(queryText);
  if (!normalized) {
    return [];
  }

  const active = PROGRAM_CONCEPTS.filter((group) =>
    group.terms.some((term) => normalized.includes(normalizeForMatch(term))),
  );

  if (active.length > 0) {
    return active;
  }
  return adHocConcepts(normalized);
}

function bestConceptWeight(
  group: ConceptGroup,
  specificText: string,
  broadText: string,
): { weight: number; matched: string | null } {
  let weight = 0;
  let matched: string | null = null;

  for (const term of group.terms) {
    const needle = normalizeForMatch(term);
    if (!needle) {
      continue;
    }
    if (specificText.includes(needle)) {
      return { weight: SPECIFIC_PROGRAM_WEIGHT, matched: term };
    }
    if (broadText.includes(needle) && weight < BROAD_AREA_WEIGHT) {
      weight = BROAD_AREA_WEIGHT;
      matched = term;
    }
  }

  return { weight, matched };
}

export type KeywordProgramMatch = {
  score: number;
  matchedConcepts: number;
  totalConcepts: number;
  matchedTerms: string[];
};

// Lexical program-fit: for every concept the student expressed, find its best
// evidence in the school's program lists (specific titles preferred over broad
// buckets). Score is the mean per-concept evidence weight in 0..1.
export function keywordProgramScore(
  queryText: string,
  programs: readonly string[] | null | undefined,
  programAreas: readonly string[] | null | undefined,
): KeywordProgramMatch {
  const concepts = queryConcepts(queryText);
  if (concepts.length === 0) {
    return { score: 0, matchedConcepts: 0, totalConcepts: 0, matchedTerms: [] };
  }

  const specificText = normalizeForMatch((programs ?? []).join(" | "));
  const broadText = normalizeForMatch((programAreas ?? []).join(" | "));

  let total = 0;
  let matchedConcepts = 0;
  const matchedTerms: string[] = [];

  for (const group of concepts) {
    const { weight, matched } = bestConceptWeight(group, specificText, broadText);
    total += weight;
    if (weight > 0) {
      matchedConcepts += 1;
      if (matched) {
        matchedTerms.push(matched);
      }
    }
  }

  return {
    score: total / concepts.length,
    matchedConcepts,
    totalConcepts: concepts.length,
    matchedTerms: [...new Set(matchedTerms)],
  };
}

export function normalizeSemantic(similarity: number | null | undefined) {
  if (similarity === null || similarity === undefined || !Number.isFinite(similarity)) {
    return 0;
  }
  const span = SEMANTIC_SIM_MAX - SEMANTIC_SIM_MIN;
  return Math.max(0, Math.min(1, (similarity - SEMANTIC_SIM_MIN) / span));
}

// Headline program/interest fit (0..100): the blend of lexical and semantic
// evidence. With no lexical program match the score is capped by the semantic
// weight, so a school the student merely overshoots on stats can never present
// as a strong program fit.
export function blendProgramFit(
  keywordScore: number,
  similarity: number | null | undefined,
) {
  const semanticNorm = normalizeSemantic(similarity);
  const blended =
    PROGRAM_FIT_WEIGHTS.keyword * Math.max(0, Math.min(1, keywordScore)) +
    PROGRAM_FIT_WEIGHTS.semantic * semanticNorm;
  return Math.round(Math.max(0, Math.min(100, blended * 100)));
}

// Academic fit (0..100): the mean of the stats-driven radar axes
// (academics, selectivity, rigor). Kept separate from program fit so strong
// stats can never hide a weak interest match.
export function academicFitFromAxes(
  values: Array<number | null | undefined>,
): number | null {
  const known = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (known.length === 0) {
    return null;
  }
  const mean = known.reduce((total, value) => total + value, 0) / known.length;
  return Math.round(Math.max(0, Math.min(100, mean)));
}
