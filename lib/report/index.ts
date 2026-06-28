import {
  answerFromToolResults,
  runCopilotTool,
  type CopilotToolInputs,
  type CopilotToolResult,
} from "../copilot";
import type { ClimbRoadmap } from "../climb";
import type { CommandCenterPlan } from "../command-center";
import type { CompassResult } from "../compass";
import type { GeneratedList } from "../list-builder";
import type { UsAdmitIntelligence } from "../score/us";
import type { StudentsLikeYouResponse } from "../similarity";

export type AdmiraReport = {
  version: "admira_report";
  title: string;
  summary: string;
  sections: {
    admit: Array<{
      tier: string;
      score: number;
      confidence: number;
      drivers: Array<{ label: string; direction: string; impact: number }>;
    }>;
    list: Array<{
      name: string;
      tier: string;
      bucket: string;
      fit: number | null;
    }>;
    similar: Array<{
      school_name: string;
      cohort_size: number;
      outcomes: {
        admitted: number;
        denied: number;
        waitlisted: number;
        deferred: number;
      };
      rates: {
        admitted: number;
        denied: number;
        waitlisted: number;
        deferred: number;
      };
    }>;
    climb: Array<{
      school_name: string;
      lever: string;
      before: number;
      after: number;
      delta: number;
      tier_claim: string | null;
    }>;
    command: {
      progress: {
        total: number;
        done: number;
        percent: number;
      } | null;
      tasks: Array<{
        title: string;
        category: string;
        status: string;
        due_date: string | null;
      }>;
    };
    compass: Array<{
      major_name: string;
      fit: number | null;
    }>;
  };
  sources: string[];
  notes: string[];
};

const REDACTED_KEYS = new Set([
  "id",
  "unitid",
  "subject_id",
  "profile_id",
  "consent_record_id",
  "email",
  "token",
  "token_hash",
  "storage_path",
]);

const MONEY_PATTERN =
  /(\$|net_cost|net[-_\s]?price|sticker|tuition|merit|scholarship|\baid\b|roi|return figure|affordab)/i;

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function redactInternalKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactInternalKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REDACTED_KEYS.has(key.toLowerCase()))
      .map(([key, nested]) => [key, redactInternalKeys(nested)]),
  );
}

function reportSourcesFromResults(results: CopilotToolResult[]) {
  const sources: string[] = [];
  for (const result of results) {
    if (result.name === "students_like_you") {
      const output = result.output as StudentsLikeYouResponse;
      sources.push(
        ...output.cohorts.flatMap((cohort) => cohort.provenance.source_urls),
      );
    }
    if (result.name === "command_center") {
      const output = result.output as CommandCenterPlan;
      sources.push(
        ...output.schools.flatMap((school) =>
          school.tasks.map((task) => task.source_url),
        ),
      );
    }
    if (result.name === "major_compass") {
      const output = result.output as CompassResult;
      sources.push(...output.sources);
    }
  }
  return uniqueSorted(sources);
}

export function buildReportFromToolResults(input: {
  title?: string;
  results: CopilotToolResult[];
}): AdmiraReport {
  const admit: AdmiraReport["sections"]["admit"] = [];
  const list: AdmiraReport["sections"]["list"] = [];
  const similar: AdmiraReport["sections"]["similar"] = [];
  const climb: AdmiraReport["sections"]["climb"] = [];
  const compass: AdmiraReport["sections"]["compass"] = [];
  const command: AdmiraReport["sections"]["command"] = {
    progress: null,
    tasks: [],
  };

  for (const result of input.results) {
    if (result.name === "admit_intelligence") {
      const output = result.output as UsAdmitIntelligence;
      admit.push({
        tier: output.tier,
        score: output.score,
        confidence: output.confidence,
        drivers: output.drivers.map((driver) => ({
          label: driver.label,
          direction: driver.direction,
          impact: driver.impact,
        })),
      });
    }

    if (result.name === "list_builder") {
      const output = result.output as GeneratedList;
      list.push(
        ...output.list.map((school) => ({
          name: school.name,
          tier: school.tier,
          bucket: school.bucket,
          fit: school.fit,
        })),
      );
    }

    if (result.name === "students_like_you") {
      const output = result.output as StudentsLikeYouResponse;
      similar.push(
        ...output.cohorts.map((cohort) => ({
          school_name: cohort.school_name,
          cohort_size: cohort.cohort_size,
          outcomes: cohort.outcomes,
          rates: cohort.rates,
        })),
      );
    }

    if (result.name === "climb_roadmap") {
      const output = result.output as ClimbRoadmap;
      climb.push(
        ...output.ranked_moves.slice(0, 5).map((move) => ({
          school_name: move.school.name,
          lever: move.lever.label,
          before: move.before.score,
          after: move.after.score,
          delta: move.delta_score,
          tier_claim: move.tier_claim,
        })),
      );
    }

    if (result.name === "command_center") {
      const output = result.output as CommandCenterPlan;
      command.progress = output.progress;
      command.tasks = output.schools
        .flatMap((school) => school.tasks)
        .slice(0, 12)
        .map((task) => ({
          title: task.title,
          category: task.category,
          status: task.status,
          due_date: task.due_date,
        }));
    }

    if (result.name === "major_compass") {
      const output = result.output as CompassResult;
      compass.push(
        ...output.majors.slice(0, 6).map((major) => ({
          major_name: major.major_name,
          fit: major.fit,
        })),
      );
    }
  }

  const report: AdmiraReport = {
    version: "admira_report",
    title: input.title ?? "Admira Copilot Report",
    summary: answerFromToolResults({
      message: "Summarize the loaded report tools.",
      results: input.results,
    }),
    sections: {
      admit,
      list,
      similar,
      climb,
      command,
      compass,
    },
    sources: reportSourcesFromResults(input.results),
    notes: [
      "Admission ranges are planning support, not guarantees.",
      "Similar-student sections only use aggregate cohorts that clear the privacy floor.",
      "The deferred planning module is not included in this report.",
    ],
  };

  return redactReportForShare(report);
}

export function buildReportFromInputs(input: {
  title?: string;
  toolInputs: CopilotToolInputs;
}) {
  const results: CopilotToolResult[] = [];
  const toolOrder = [
    "admit_intelligence",
    "list_builder",
    "students_like_you",
    "climb_roadmap",
    "command_center",
    "major_compass",
  ] as const;

  for (const tool of toolOrder) {
    try {
      results.push(runCopilotTool(tool, input.toolInputs));
    } catch {
      // Missing optional context simply leaves the section out of the report.
    }
  }

  return {
    report: buildReportFromToolResults({ title: input.title, results }),
    results,
  };
}

export function redactReportForShare(report: AdmiraReport): AdmiraReport {
  return redactInternalKeys(report) as AdmiraReport;
}

export function assertNoMoneyReport(report: unknown) {
  const text = JSON.stringify(report);
  if (MONEY_PATTERN.test(text)) {
    throw new Error("Report contains deferred-money terminology.");
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderReportHtml(report: AdmiraReport) {
  const rows = [
    ...report.sections.admit.map(
      (item) =>
        `<li><strong>Admit:</strong> ${escapeHtml(item.tier)} score ${item.score}, confidence ${item.confidence}</li>`,
    ),
    ...report.sections.list.map(
      (item) =>
        `<li><strong>List:</strong> ${escapeHtml(item.name)} ${escapeHtml(item.tier)} ${escapeHtml(item.bucket)} fit ${item.fit ?? "unscored"}</li>`,
    ),
    ...report.sections.similar.map(
      (item) =>
        `<li><strong>Similar:</strong> ${escapeHtml(item.school_name)} cohort ${item.cohort_size}</li>`,
    ),
    ...report.sections.climb.map(
      (item) =>
        `<li><strong>Climb:</strong> ${escapeHtml(item.school_name)} ${escapeHtml(item.lever)} ${item.before} to ${item.after}</li>`,
    ),
    ...report.sections.compass.map(
      (item) =>
        `<li><strong>Compass:</strong> ${escapeHtml(item.major_name)} fit ${item.fit ?? "unscored"}</li>`,
    ),
  ];

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(report.title)}</title>`,
    "</head>",
    "<body>",
    `<h1>${escapeHtml(report.title)}</h1>`,
    `<p>${escapeHtml(report.summary)}</p>`,
    `<ul>${rows.join("")}</ul>`,
    "</body>",
    "</html>",
  ].join("");
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderReportPdf(report: AdmiraReport) {
  const textLines = [
    report.title,
    report.summary,
    ...report.sections.admit.map(
      (item) => `Admit ${item.tier} score ${item.score}`,
    ),
    ...report.sections.list.slice(0, 5).map(
      (item) => `List ${item.name} ${item.tier} ${item.bucket}`,
    ),
    ...report.sections.climb.slice(0, 5).map(
      (item) => `Climb ${item.school_name} ${item.lever} ${item.before} to ${item.after}`,
    ),
  ].slice(0, 24);

  const stream = [
    "BT",
    "/F1 14 Tf",
    "50 760 Td",
    ...textLines.flatMap((line, index) => [
      index === 0 ? "" : "0 -24 Td",
      `(${pdfEscape(line.slice(0, 96))}) Tj`,
    ]),
    "ET",
  ]
    .filter(Boolean)
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  const parts = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(parts.join("").length);
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = parts.join("").length;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  return new TextEncoder().encode(parts.join(""));
}
