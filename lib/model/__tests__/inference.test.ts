import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildChancePayload,
  engineerFeatures,
  featureOrder,
  predict,
  type InferenceSchool,
} from "../inference";
import { chanceRequestSchema } from "../schema";
import testVectors from "../test_vectors.json";

const TOLERANCE = 1e-6;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function nullableNumber(value: string) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadSchools() {
  const csvPath = join(
    process.cwd(),
    "pipeline",
    "data",
    "schools_public_cache.csv",
  );
  const [headerLine, ...lines] = readFileSync(csvPath, "utf-8")
    .trim()
    .split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  const schools = new Map<number, InferenceSchool>();

  lines.forEach((line) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    schools.set(Number(row.unitid), {
      unitid: Number(row.unitid),
      name: row.name,
      setting: row.setting || null,
      size: nullableNumber(row.size),
      admit_rate: nullableNumber(row.admit_rate),
      sat_25: nullableNumber(row.sat_25),
      sat_75: nullableNumber(row.sat_75),
      act_25: nullableNumber(row.act_25),
      act_75: nullableNumber(row.act_75),
      gpa_avg: nullableNumber(row.gpa_avg),
      test_policy: row.test_policy || "unknown",
      c7_factors: row.c7_factors ? JSON.parse(row.c7_factors) : {},
      selectivity_tier: row.selectivity_tier,
    });
  });

  return schools;
}

const schools = loadSchools();

describe("TypeScript public-prior inference", () => {
  it("round-trips every Python test vector within tolerance", () => {
    let maxFeatureError = 0;
    let maxOutputError = 0;

    testVectors.forEach((vector) => {
      const school = schools.get(vector.input.unitid);
      expect(school, `missing fixture school ${vector.input.unitid}`).toBeDefined();

      const request = chanceRequestSchema.parse({
        unitid: vector.input.unitid,
        sat_score: vector.input.sat_score,
        act_score: vector.input.act_score,
        gpa: vector.input.gpa,
        application_round: vector.input.application_round,
      });
      const features = engineerFeatures(request, school!);

      featureOrder.forEach((feature) => {
        const error = Math.abs(features[feature] - vector.features[feature]);
        maxFeatureError = Math.max(maxFeatureError, error);
        expect(error, `${vector.input.school_name} ${feature}`).toBeLessThanOrEqual(
          TOLERANCE,
        );
      });

      const output = predict(features);
      const comparisons = [
        [output.point, vector.output.point_probability, "point"],
        [output.calibrated, vector.output.calibrated_probability, "calibrated"],
        [output.low, vector.output.interval_low, "low"],
        [output.high, vector.output.interval_high, "high"],
        [output.width, vector.output.interval_width, "width"],
      ] as const;

      comparisons.forEach(([actual, expected, label]) => {
        const error = Math.abs(actual - expected);
        maxOutputError = Math.max(maxOutputError, error);
        expect(error, `${vector.input.school_name} ${label}`).toBeLessThanOrEqual(
          TOLERANCE,
        );
      });
    });

    console.info(
      `round-trip max feature error=${maxFeatureError}; max output error=${maxOutputError}`,
    );
    expect(maxFeatureError).toBeLessThanOrEqual(TOLERANCE);
    expect(maxOutputError).toBeLessThanOrEqual(TOLERANCE);
  });

  it("rejects out-of-range SAT, ACT, and GPA values", () => {
    expect(
      chanceRequestSchema.safeParse({ unitid: 1, sat_score: 399 }).success,
    ).toBe(false);
    expect(
      chanceRequestSchema.safeParse({ unitid: 1, act_score: 37 }).success,
    ).toBe(false);
    expect(chanceRequestSchema.safeParse({ unitid: 1, gpa: 5.1 }).success).toBe(
      false,
    );
  });

  it("allows missing SAT/ACT inputs and widens the response band", () => {
    const school = schools.get(104151);
    expect(school).toBeDefined();
    const request = chanceRequestSchema.parse({ unitid: 104151 });
    const features = engineerFeatures(request, school!);
    const normal = predict(features);
    const widened = predict(features, { lowInputConfidence: true });

    expect(widened.width).toBeGreaterThan(normal.width);

    const payload = buildChancePayload(request, school!);
    expect(payload.band.input_confidence).toBe("low");
    expect(payload.probability.width).toBeGreaterThan(normal.width);
  });

  it("accepts but strips race or ethnicity keys", () => {
    const parsed = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      application_round: "regular",
      race: "ignored",
      ethnicity: "ignored",
    });

    expect("race" in parsed).toBe(false);
    expect("ethnicity" in parsed).toBe(false);

    const payload = buildChancePayload(parsed, schools.get(166683)!);
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("race");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("ethnic");
  });

  it("labels elite wide intervals as reach bands", () => {
    const request = chanceRequestSchema.parse({
      unitid: 166683,
      sat_score: 1540,
      act_score: 35,
      gpa: 3.95,
      application_round: "regular",
    });
    const payload = buildChancePayload(request, schools.get(166683)!);

    expect(payload.band.label).toBe("reach");
    expect(payload.band.wide_band).toBe(true);
    expect(payload.probability.low).toBeLessThanOrEqual(
      payload.probability.calibrated,
    );
    expect(payload.probability.high).toBeGreaterThanOrEqual(
      payload.probability.calibrated,
    );
  });
});
