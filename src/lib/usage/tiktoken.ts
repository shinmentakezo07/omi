import { encodingForModel, getEncoding } from "js-tiktoken";

type TiktokenEncoder = {
  encode: (value: string) => number[];
};

const encoderCache = new Map<string, TiktokenEncoder>();

function normalizeModel(model: string): string {
  if (!model) return "gpt-4o-mini";
  return model.replace(/^.+\//, "").replace(/-\d{8}$/, "");
}

function getEncoder(model: string): TiktokenEncoder {
  const normalized = normalizeModel(model);
  const cached = encoderCache.get(normalized);
  if (cached) {
    return cached;
  }

  let encoder: TiktokenEncoder;
  try {
    encoder = encodingForModel(normalized as Parameters<typeof encodingForModel>[0]);
  } catch {
    encoder = getEncoding("cl100k_base");
  }
  encoderCache.set(normalized, encoder);
  return encoder;
}

export function estimateTokensWithTiktoken(model: string, value: unknown): number {
  if (typeof value !== "string" || value.length === 0) {
    return 0;
  }

  return getEncoder(model).encode(value).length;
}
