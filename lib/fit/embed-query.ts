import "server-only";

import { EMBEDDING_DIM, EMBEDDING_MODEL_ID } from "./embedding-model";
import type { FitRequest } from "./schema";

type TensorLike = {
  tolist: () => unknown;
};

type FeatureExtractor = (
  documents: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<TensorLike>;

type TransformersModule = {
  pipeline: (
    task: "feature-extraction",
    model: string,
  ) => Promise<FeatureExtractor>;
};

let extractorPromise: Promise<FeatureExtractor> | null = null;

function normalizedText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function normalizedLabel(value: string | undefined) {
  return normalizedText(value)?.replace(/_/g, " ").toLowerCase();
}

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("@xenova/transformers").then((module) => {
      const transformers = module as unknown as TransformersModule;
      return transformers.pipeline("feature-extraction", EMBEDDING_MODEL_ID);
    });
  }

  return extractorPromise;
}

function vectorFromTensor(output: TensorLike) {
  const raw = output.tolist();
  const first = Array.isArray(raw) ? raw[0] : undefined;

  if (!Array.isArray(first)) {
    throw new Error("Embedding output did not include a vector");
  }

  const vector = first.map((value) => Number(value));
  if (
    vector.length !== EMBEDDING_DIM ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Embedding output must be ${EMBEDDING_DIM} finite dimensions`,
    );
  }

  return vector;
}

export function buildFitQueryDocument(input: FitRequest) {
  const sentences = ["Student fit query."];
  const descriptorParts = [];
  const size = normalizedLabel(input.preferred_size);
  const setting = normalizedLabel(input.preferred_setting);

  if (size) {
    descriptorParts.push(size);
  }
  if (setting) {
    descriptorParts.push(setting);
  }

  const region = normalizedText(input.preferred_region);
  const descriptor = descriptorParts.join(" ");
  if (descriptor && region) {
    sentences.push(`Prefers a ${descriptor} school in the ${region}.`);
  } else if (descriptor) {
    sentences.push(`Prefers a ${descriptor} school.`);
  } else if (region) {
    sentences.push(`Prefers a school in the ${region}.`);
  }

  const programParts = [
    normalizedText(input.intended_major),
    normalizedText(input.interests),
  ].filter(Boolean);
  if (programParts.length > 0) {
    sentences.push(`Programs: ${programParts.join(", ")}.`);
  }

  const learningStyle = normalizedText(input.learning_style_notes);
  if (learningStyle) {
    sentences.push(`Learning style: ${learningStyle}.`);
  }

  if (input.cost_ceiling !== undefined) {
    sentences.push(`Costs: published cost ceiling $${Math.round(input.cost_ceiling)}.`);
  }

  return sentences.join(" ");
}

export async function embedFitDocuments(documents: string[]) {
  const extractor = await getExtractor();
  const output = await extractor(documents, {
    pooling: "mean",
    normalize: true,
  });
  const raw = output.tolist();

  if (!Array.isArray(raw)) {
    throw new Error("Embedding output did not include vectors");
  }

  return raw.map((item) => {
    if (!Array.isArray(item)) {
      throw new Error("Embedding output included a non-vector item");
    }
    const vector = item.map((value) => Number(value));
    if (
      vector.length !== EMBEDDING_DIM ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding output must be ${EMBEDDING_DIM} finite dimensions`,
      );
    }
    return vector;
  });
}

export async function embedFitQuery(input: FitRequest) {
  const document = buildFitQueryDocument(input);
  const extractor = await getExtractor();
  const output = await extractor([document], {
    pooling: "mean",
    normalize: true,
  });
  const vector = vectorFromTensor(output);

  return {
    document,
    vector,
    model: EMBEDDING_MODEL_ID,
    dim: EMBEDDING_DIM,
  };
}

export function resetFitQueryEmbedderForTests() {
  extractorPromise = null;
}
