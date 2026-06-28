import { describe, expect, it } from "vitest";

import { runCopilotTool, type CopilotToolResult } from "../../copilot";
import { buildReportFromToolResults, assertNoMoneyReport, renderReportHtml, renderReportPdf } from "../index";
import { createReportShareToken, hashReportShareToken } from "../share";

const school = {
  unitid: 166683,
  name: "Massachusetts Institute of Technology",
  country: "US" as const,
  setting: "city",
  size: 4535,
  admit_rate: 0.0455,
  sat_25: 1520,
  sat_75: 1580,
  act_25: 34,
  act_75: 36,
  gpa_avg: null,
  test_policy: "required",
  c7_factors: { rigor: "Very Important" },
  selectivity_tier: "elite",
  program_areas: ["Engineering"],
  programs: ["Computer Science"],
  net_price_avg: 22000,
  sticker_cost: 82000,
  similarity: 0.9,
};

const profile = {
  unitid: school.unitid,
  sat_score: 1540,
  act_score: 35,
  gpa: 3.95,
  application_round: "regular" as const,
  intended_major: "Computer science",
};

function toolResults(): CopilotToolResult[] {
  const admit = runCopilotTool("admit_intelligence", {
    admit_intelligence: { input: profile, school },
  });
  const list = runCopilotTool("list_builder", {
    list_builder: {
      profile,
      preferences: { intended_major: "Computer science", interests: "robotics" },
      candidates: [school],
    },
  });
  const climb = runCopilotTool("climb_roadmap", {
    climb_roadmap: {
      profile,
      schools: [school],
    },
  });
  const command = runCopilotTool("command_center", {
    command_center: {
      schools: [
        {
          unitid: school.unitid,
          name: school.name,
          country: "US",
          admission_system: "direct",
        },
      ],
      programRequirements: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          unitid: school.unitid,
          program_name: "Computer Science",
          system: "direct",
          cutoff_avg_low: null,
          cutoff_avg_high: null,
          cutoff_basis: null,
          prerequisites: [],
          test_policy: "required",
          supplemental_app: true,
          broad_based_admission: false,
          source_url: "https://example.com/requirements",
        },
      ],
      deadlines: [],
    },
  });
  const compass = runCopilotTool("major_compass", {
    major_compass: {
      majors: [
        {
          major_name: "Computer Science",
          median_earnings_10yr: 98000,
          source_url: "https://example.com/major",
        },
      ],
      careers: [
        {
          major_name: "Computer Science",
          career_title: "Software Developer",
          median_wage_annual: 132000,
          source_url: "https://example.com/career",
        },
      ],
      studentInterests: "robotics and computing",
      school,
      profile,
    },
  });

  return [admit, list, climb, command, compass];
}

describe("Admira reports", () => {
  it("copies report figures from tool outputs", () => {
    const results = toolResults();
    const report = buildReportFromToolResults({ results });
    const admit = results[0].output as (typeof results)[0]["output"] & {
      score: number;
      tier: string;
    };
    const list = results[1].output as {
      list: Array<{ name: string; tier: string; fit: number | null }>;
    };
    const climb = results[2].output as {
      ranked_moves: Array<{ delta_score: number; after: { score: number } }>;
    };

    expect(report.sections.admit[0].score).toBe(admit.score);
    expect(report.sections.admit[0].tier).toBe(admit.tier);
    expect(report.sections.list[0].name).toBe(list.list[0].name);
    expect(report.sections.list[0].fit).toBe(list.list[0].fit);
    expect(report.sections.climb[0].delta).toBe(climb.ranked_moves[0].delta_score);
    expect(report.sections.climb[0].after).toBe(climb.ranked_moves[0].after.score);
  });

  it("omits deferred-money fields and internal identifiers", () => {
    const report = buildReportFromToolResults({ results: toolResults() });
    const serialized = JSON.stringify(report).toLowerCase();

    expect(() => assertNoMoneyReport(report)).not.toThrow();
    expect(serialized).not.toContain("net_cost");
    expect(serialized).not.toContain("net_price");
    expect(serialized).not.toContain("affordable");
    expect(serialized).not.toContain("roi");
    expect(serialized).not.toContain("subject_id");
    expect(serialized).not.toContain("profile_id");
    expect(serialized).not.toContain("consent_record_id");
    expect(serialized).not.toContain("unitid");
  });

  it("renders HTML and PDF from the sanitized report", () => {
    const report = buildReportFromToolResults({ results: toolResults() });
    const html = renderReportHtml(report);
    const pdf = renderReportPdf(report);

    expect(html).toContain("Admira Copilot Report");
    expect(html.toLowerCase()).not.toContain("net price");
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
  });

  it("uses unguessable token hashes for share links", () => {
    const token = createReportShareToken();
    const hash = hashReportShareToken(token);

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });
});
