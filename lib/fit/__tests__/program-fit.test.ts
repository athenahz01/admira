import { describe, expect, it } from "vitest";

import {
  PROGRAM_FIT_WEAK_THRESHOLD,
  blendProgramFit,
  keywordProgramScore,
  queryConcepts,
} from "../program-fit";

describe("queryConcepts", () => {
  it("expands a query into curated program concepts with synonyms", () => {
    const ids = queryConcepts("public policy. computer science").map((c) => c.id);
    expect(ids).toContain("public_policy");
    expect(ids).toContain("computer_science");
  });

  it("treats public policy and political science as the same concept", () => {
    expect(queryConcepts("political science").map((c) => c.id)).toContain(
      "public_policy",
    );
    expect(queryConcepts("public affairs").map((c) => c.id)).toContain(
      "public_policy",
    );
  });

  it("falls back to ad-hoc tokens for unknown interests", () => {
    const ids = queryConcepts("equestrian studies").map((c) => c.id);
    expect(ids.every((id) => id.startsWith("adhoc:"))).toBe(true);
  });
});

describe("keywordProgramScore", () => {
  const query = "public policy. computer science";

  it("scores a literal program match at full strength", () => {
    const match = keywordProgramScore(
      query,
      ["Computer Science", "Public Policy Analysis", "Political Science and Government"],
      ["Computer and information sciences", "Social sciences"],
    );
    expect(match.score).toBe(1);
    expect(match.matchedConcepts).toBe(2);
  });

  it("does not credit program fit for stats-only schools", () => {
    const match = keywordProgramScore(
      query,
      ["Business Administration", "Nursing", "Education"],
      ["Business and marketing", "Health professions", "Education"],
    );
    expect(match.score).toBe(0);
    expect(match.matchedConcepts).toBe(0);
  });

  it("gives partial credit when only one concept matches", () => {
    const match = keywordProgramScore(query, ["Computer Science"], null);
    expect(match.score).toBeCloseTo(0.5);
  });
});

describe("blendProgramFit", () => {
  it("ranks a real program match far above a stats-only overshoot", () => {
    const strong = blendProgramFit(1, 0.55);
    const weak = blendProgramFit(0, 0.45);
    expect(strong).toBeGreaterThan(80);
    expect(weak).toBeLessThan(PROGRAM_FIT_WEAK_THRESHOLD);
    expect(strong - weak).toBeGreaterThan(40);
  });

  it("caps schools with no program match by the semantic weight", () => {
    expect(blendProgramFit(0, 1)).toBeLessThanOrEqual(40);
  });
});
