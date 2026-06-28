import "server-only";

import { copilotToolRegistry, sanitizeModelText, type CopilotToolResult } from ".";

const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export function copilotEnabled() {
  return process.env.ADMIRA_COPILOT_ENABLED === "true";
}

export function copilotConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function copilotModel() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
}

export function buildCopilotSystemPrompt() {
  const tools = copilotToolRegistry
    .map((tool) => `${tool.name} wraps ${tool.wraps}`)
    .join("\n");

  return [
    "You are Admira Copilot. You may add qualitative planning language only.",
    "Do not write any numeral, percentage, currency, rank, score, count, or date.",
    "Every number shown to the user is already supplied by server tool receipts.",
    "Do not discuss cost, net price, merit aid, scholarships, tuition, affordability, or ROI.",
    "Do not expose private identifiers or raw similar-student rows.",
    "Registered tools:",
    tools,
  ].join("\n");
}

export function buildCopilotUserMessage(input: {
  message: string;
  results: CopilotToolResult[];
}) {
  return [
    `Student question: ${input.message}`,
    "Tool receipts are available to the server-rendered answer. Do not repeat any number from them.",
    JSON.stringify(
      input.results.map((result) => ({
        name: result.name,
        received: true,
      })),
    ),
  ].join("\n\n");
}

export async function* streamCopilotQualitativeText(input: {
  message: string;
  results: CopilotToolResult[];
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Copilot model is not configured.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: copilotModel(),
      max_tokens: 500,
      temperature: 0.2,
      system: buildCopilotSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildCopilotUserMessage(input),
        },
      ],
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Copilot model is temporarily unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
        };
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          yield sanitizeModelText(event.delta.text);
        }
      } catch {
        // Ignore keepalive and non-JSON provider frames.
      }
    }
  }
}
