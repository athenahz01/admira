import { describe, expect, it } from "vitest";

import seed from "../../../pipeline/data/merit/merit_seed.json";
import {
  assertMoneyLineage,
  buildMoneyPlan,
  predictMerit,
  type MoneyMeritRule,
  type MoneyNetPriceRow,
} from "../index";

const moneySeed = seed as {
  merit_rules: MoneyMeritRule[];
  net_price_bands: MoneyNetPriceRow[];
};

function rowsFor(unitid: number) {
  return {
    meritRules: moneySeed.merit_rules.filter((rule) => rule.unitid === unitid),
    netRows: moneySeed.net_price_bands.filter((row) => row.unitid === unitid),
  };
}

describe("Money engine", () => {
  it("requires sourced merit and net-price lineage", () => {
    expect(() => assertMoneyLineage(moneySeed)).not.toThrow();
    expect(() =>
      assertMoneyLineage({
        merit_rules: [
          {
            ...moneySeed.merit_rules[0],
            source_url: "",
          },
        ],
      }),
    ).toThrow(/source_url/);
  });

  it("matches published automatic merit tiers", () => {
    const ua = rowsFor(100751);
    const uaResult = predictMerit(
      { gpa: 3.95, sat_score: 1420 },
      ua.meritRules,
      { residency: "out_of_state" },
    );
    expect(uaResult.amount).toMatchObject({
      value: 28000,
      basis: "verified",
      source_url: "https://afford.ua.edu/scholarships/out-of-state-freshman/",
    });

    const carleton = rowsFor(-124011);
    const carletonResult = predictMerit(
      { canadian_average: 95 },
      carleton.meritRules,
      { residency: "domestic" },
    );
    expect(carletonResult.amount).toMatchObject({
      value: 4000,
      basis: "verified",
      source_url: "https://www.ouinfo.ca/universities/carleton/scholarships",
    });
  });

  it("splits baseline aid after merit so average aid is not double-counted", () => {
    const { meritRules, netRows } = rowsFor(100751);
    const plan = buildMoneyPlan({
      school: { unitid: 100751, name: "The University of Alabama", country: "US" },
      profile: { gpa: 3.95, sat_score: 1420 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "75001-110000",
      residency: "out_of_state",
    });

    expect(plan.figures.sticker_price.value).toBe(33382);
    expect(plan.figures.baseline_net_price.value).toBe(25658);
    expect(plan.figures.merit.value).toBe(28000);
    expect(plan.figures.need_aid.value).toBe(0);
    expect(plan.figures.true_net_price.value).toBe(5382);
    expect(plan.figures.true_net_price.basis).toBe("estimate");
    expect(plan.figures.payback_years.value).toBe(0.4);
  });

  it("keeps no-merit schools at the sourced baseline net price", () => {
    const { meritRules, netRows } = rowsFor(104151);
    const plan = buildMoneyPlan({
      school: {
        unitid: 104151,
        name: "Arizona State University Campus Immersion",
        country: "US",
      },
      profile: { gpa: 3.5, sat_score: 1200 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "48001-75000",
      residency: "out_of_state",
    });

    expect(plan.figures.merit).toMatchObject({
      value: 0,
      basis: "estimate",
    });
    expect(plan.figures.true_net_price.value).toBe(16801);
  });

  it("supports Canada with sourced tuition, merit, and field earnings", () => {
    const { meritRules, netRows } = rowsFor(-124011);
    const plan = buildMoneyPlan({
      school: { unitid: -124011, name: "Carleton University", country: "CA" },
      profile: { canadian_average: 95 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "overall",
      residency: "domestic",
    });

    expect(plan.currency).toBe("CAD");
    expect(plan.figures.merit.value).toBe(4000);
    expect(plan.figures.true_net_price.value).toBe(6549);
    expect(plan.figures.median_earnings_10yr).toMatchObject({
      value: 101800,
      basis: "verified",
      source_url: "https://www.jobbank.gc.ca/career-planning/school-work-transition/11.0701/LOS05",
    });
    expect(plan.roi.available).toBe(true);
  });

  it("labels derived figures verified when no modeled merit is applied (UCSD)", () => {
    const { meritRules, netRows } = rowsFor(110680);
    const plan = buildMoneyPlan({
      school: {
        unitid: 110680,
        name: "University of California-San Diego",
        country: "US",
      },
      profile: { gpa: 3.9, sat_score: 1400 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "overall",
      residency: "out_of_state",
    });

    // No automatic-merit rule exists for UCSD, so nothing modeled was mixed in.
    expect(plan.merit.matched).toBe(false);
    expect(plan.figures.merit.value).toBe(0);

    // True net equals the verified Scorecard net; downstream figures are
    // arithmetic on verified inputs -> all verified.
    expect(plan.figures.true_net_price.basis).toBe("verified");
    expect(plan.figures.need_aid.basis).toBe("verified");
    expect(plan.figures.four_year_net_cost.basis).toBe("verified");
    expect(plan.figures.payback_years.basis).toBe("verified");
    expect(plan.figures.earnings_to_cost_ratio.basis).toBe("verified");

    // Passthrough figures keep their sourced basis.
    expect(plan.figures.sticker_price.basis).toBe("verified");
    expect(plan.figures.baseline_net_price.basis).toBe("verified");
    expect(plan.figures.median_earnings_10yr.basis).toBe("verified");
  });

  it("labels derived figures estimate when a modeled merit is applied (Alabama)", () => {
    const { meritRules, netRows } = rowsFor(100751);
    const plan = buildMoneyPlan({
      school: { unitid: 100751, name: "The University of Alabama", country: "US" },
      profile: { gpa: 3.95, sat_score: 1420 },
      meritRules,
      netPriceRows: netRows,
      incomeBand: "75001-110000",
      residency: "out_of_state",
    });

    expect(plan.merit.matched).toBe(true);
    expect(plan.figures.merit.value).toBe(28000);

    // A predicted award was subtracted from the verified net -> modeled.
    expect(plan.figures.true_net_price.basis).toBe("estimate");
    expect(plan.figures.need_aid.basis).toBe("estimate");
    expect(plan.figures.four_year_net_cost.basis).toBe("estimate");
    expect(plan.figures.payback_years.basis).toBe("estimate");
    expect(plan.figures.earnings_to_cost_ratio.basis).toBe("estimate");
  });

  it("keeps payback and ratio estimate when earnings basis is estimate even at merit $0", () => {
    const verifiedRow = rowsFor(110680).netRows.find(
      (row) => row.income_band === "overall",
    )!;
    // Verified cost row, but the earnings figure is an estimate. Merit stays $0
    // (no rules), so net/need/4-year are verified while payback/ratio degrade.
    const estimateEarningsRow: MoneyNetPriceRow = {
      ...verifiedRow,
      earnings_basis: "estimate",
    };
    const plan = buildMoneyPlan({
      school: {
        unitid: 110680,
        name: "University of California-San Diego",
        country: "US",
      },
      profile: { gpa: 3.9, sat_score: 1400 },
      meritRules: [],
      netPriceRows: [estimateEarningsRow],
      incomeBand: "overall",
      residency: "out_of_state",
    });

    expect(plan.figures.merit.value).toBe(0);
    expect(plan.figures.true_net_price.basis).toBe("verified");
    expect(plan.figures.need_aid.basis).toBe("verified");
    expect(plan.figures.four_year_net_cost.basis).toBe("verified");
    expect(plan.figures.median_earnings_10yr.basis).toBe("estimate");
    expect(plan.figures.payback_years.basis).toBe("estimate");
    expect(plan.figures.earnings_to_cost_ratio.basis).toBe("estimate");
  });

  it("keeps every figure value byte-identical to the committed snapshot", () => {
    // Regression guard: the basis-labeling fix must not move a single number.
    // These values are captured from the sourced seed over fixed inputs; a
    // change here means a numeric regression, not a labeling change.
    const SNAPSHOT: Record<
      string,
      { u: number; sn: string; c: "US" | "CA"; band: string; res: string; prof: Record<string, number>; values: Record<string, number | null> }
    > = {
      "UCSD overall": {
        u: 110680, sn: "University of California-San Diego", c: "US", band: "overall", res: "out_of_state", prof: { gpa: 3.9, sat_score: 1400 },
        values: { sticker_price: 38701, baseline_net_price: 12470, need_aid: 26231, merit: 0, true_net_price: 12470, four_year_net_cost: 49880, median_earnings_10yr: 84943, payback_years: 0.6, earnings_to_cost_ratio: 6.81 },
      },
      "UCSD 0-30000": {
        u: 110680, sn: "University of California-San Diego", c: "US", band: "0-30000", res: "out_of_state", prof: { gpa: 3.9, sat_score: 1400 },
        values: { sticker_price: 38701, baseline_net_price: 7525, need_aid: 31176, merit: 0, true_net_price: 7525, four_year_net_cost: 30100, median_earnings_10yr: 84943, payback_years: 0.4, earnings_to_cost_ratio: 11.29 },
      },
      "Alabama merit": {
        u: 100751, sn: "The University of Alabama", c: "US", band: "75001-110000", res: "out_of_state", prof: { gpa: 3.95, sat_score: 1420 },
        values: { sticker_price: 33382, baseline_net_price: 25658, need_aid: 0, merit: 28000, true_net_price: 5382, four_year_net_cost: 21528, median_earnings_10yr: 59221, payback_years: 0.4, earnings_to_cost_ratio: 11 },
      },
      "ASU no-merit": {
        u: 104151, sn: "Arizona State University Campus Immersion", c: "US", band: "48001-75000", res: "out_of_state", prof: { gpa: 3.5, sat_score: 1200 },
        values: { sticker_price: 30111, baseline_net_price: 16801, need_aid: 13310, merit: 0, true_net_price: 16801, four_year_net_cost: 67204, median_earnings_10yr: 62668, payback_years: 1.1, earnings_to_cost_ratio: 3.73 },
      },
      "Carleton CA": {
        u: -124011, sn: "Carleton University", c: "CA", band: "overall", res: "domestic", prof: { canadian_average: 95 },
        values: { sticker_price: 10549, baseline_net_price: 10549, need_aid: 0, merit: 4000, true_net_price: 6549, four_year_net_cost: 26196, median_earnings_10yr: 101800, payback_years: 0.3, earnings_to_cost_ratio: 15.54 },
      },
    };

    for (const [caseName, expected] of Object.entries(SNAPSHOT)) {
      const { meritRules, netRows } = rowsFor(expected.u);
      const plan = buildMoneyPlan({
        school: { unitid: expected.u, name: expected.sn, country: expected.c },
        profile: expected.prof,
        meritRules,
        netPriceRows: netRows,
        incomeBand: expected.band as never,
        residency: expected.res as never,
      });
      for (const [figureName, value] of Object.entries(expected.values)) {
        expect(
          plan.figures[figureName as keyof typeof plan.figures].value,
          `${caseName}.${figureName}`,
        ).toBe(value);
      }
    }
  });

  it("is deterministic and never produces a negative net price", () => {
    const baseRow = rowsFor(100751).netRows.find(
      (row) => row.income_band === "overall",
    )!;
    const hugeMerit: MoneyMeritRule = {
      rule_id: "test-huge-merit",
      unitid: 100751,
      school_name: "The University of Alabama",
      country: "US",
      scholarship_name: "Huge test scholarship",
      residency: "any",
      currency: "USD",
      basis: "estimate",
      annual_amount: 999999,
      gpa_min: 0,
      source_url: "https://example.com/source",
    };

    const input = {
      school: { unitid: 100751, name: "The University of Alabama", country: "US" as const },
      profile: { gpa: 4 },
      meritRules: [hugeMerit],
      netPriceRows: [baseRow],
      incomeBand: "overall" as const,
      residency: "out_of_state" as const,
    };
    const first = buildMoneyPlan(input);
    const second = buildMoneyPlan(input);

    expect(first.figures.true_net_price.value).toBe(0);
    expect(second).toEqual(first);
  });
});
