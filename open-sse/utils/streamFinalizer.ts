import { FORMATS } from "../translator/formats.ts";

type JsonRecord = Record<string, unknown>;

type ChatCompletionResultOptions = {
  id?: unknown;
  created?: unknown;
  model?: unknown;
  fallbackModel?: string | null;
  message: JsonRecord;
  usage: JsonRecord | null;
  finishReason: string | null;
  streamed?: boolean;
};

type ClaudeMessageResultOptions = {
  id?: unknown;
  model?: unknown;
  role?: unknown;
  content: unknown[];
  stopReason: string | null;
  stopSequence?: string | null;
  usage: JsonRecord | null;
  fallbackModel?: string | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function toString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function mergeUsageSnapshot(
  current: JsonRecord | null,
  incoming: JsonRecord | null
): JsonRecord | null {
  if (!current && !incoming) return null;

  const next: JsonRecord = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const previous = next[key];
      if (typeof previous !== "number" || previous <= 0 || value > 0) {
        next[key] = value;
      }
      continue;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      next[key] = value;
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = { ...asRecord(next[key]), ...asRecord(value) };
    }
  }

  return next;
}

export function normalizeFinalFinishReason(
  finishReason: string | null,
  hasToolCalls: boolean
): string {
  if (hasToolCalls) return "tool_calls";
  return finishReason || "stop";
}

export function buildChatCompletionResult({
  id,
  created,
  model,
  fallbackModel,
  message,
  usage,
  finishReason,
  streamed = false,
}: ChatCompletionResultOptions): JsonRecord {
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  const finalFinishReason = normalizeFinalFinishReason(finishReason, hasToolCalls);
  const result: JsonRecord = {
    id: toString(id, `chatcmpl-${Date.now()}`),
    object: "chat.completion",
    created: toNumber(created, Math.floor(Date.now() / 1000)),
    model: toString(model, fallbackModel || "unknown"),
    choices: [
      {
        index: 0,
        message,
        finish_reason: finalFinishReason,
      },
    ],
  };

  if (usage && Object.keys(usage).length > 0) {
    result.usage = usage;
  }
  if (streamed) {
    result._streamed = true;
  }

  return result;
}

export function buildOnCompleteResponseBody({
  message,
  usage,
  finishReason,
}: {
  message: JsonRecord;
  usage: JsonRecord | null;
  finishReason: string | null;
}): JsonRecord {
  const normalizedUsage = usage || null;
  const prompt = Number(normalizedUsage?.prompt_tokens ?? normalizedUsage?.input_tokens ?? 0);
  const completion = Number(
    normalizedUsage?.completion_tokens ?? normalizedUsage?.output_tokens ?? 0
  );

  return buildChatCompletionResult({
    message,
    usage: {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: Number(normalizedUsage?.total_tokens ?? prompt + completion),
    },
    finishReason,
    streamed: true,
  });
}

export function buildClaudeMessageResult({
  id,
  model,
  role,
  content,
  stopReason,
  stopSequence,
  usage,
  fallbackModel,
}: ClaudeMessageResultOptions): JsonRecord {
  return {
    id: toString(id, `msg_${Date.now()}`),
    type: "message",
    role: toString(role, "assistant"),
    model: toString(model, fallbackModel || FORMATS.CLAUDE),
    content,
    stop_reason: stopReason || "end_turn",
    ...(stopSequence ? { stop_sequence: stopSequence } : {}),
    ...(usage && Object.keys(usage).length > 0 ? { usage } : {}),
  };
}

export function buildResponsesSummaryFromPayloads(
  payloads: JsonRecord[],
  fallbackModel?: string | null
): JsonRecord | null {
  if (payloads.length === 0) return null;

  let completed: JsonRecord | null = null;
  let latestResponse: JsonRecord | null = null;
  let usage: JsonRecord | null = null;
  const textParts: string[] = [];

  for (const payload of payloads) {
    const eventType = toString(payload.type);
    if (
      eventType === "response.completed" &&
      payload.response &&
      typeof payload.response === "object"
    ) {
      completed = asRecord(payload.response);
    }
    if (payload.response && typeof payload.response === "object") {
      latestResponse = asRecord(payload.response);
    } else if (payload.object === "response") {
      latestResponse = payload;
    }
    if (
      eventType === "response.output_text.delta" &&
      typeof payload.delta === "string" &&
      payload.delta.length > 0
    ) {
      textParts.push(payload.delta);
    }
    if (payload.usage && typeof payload.usage === "object") {
      usage = mergeUsageSnapshot(usage, asRecord(payload.usage));
    } else if (payload.response && typeof asRecord(payload.response).usage === "object") {
      usage = mergeUsageSnapshot(usage, asRecord(asRecord(payload.response).usage));
    }
  }

  const picked = completed || latestResponse;
  if (picked && Object.keys(picked).length > 0) {
    return {
      id: toString(picked.id, `resp_${Date.now()}`),
      object: "response",
      model: toString(picked.model, fallbackModel || "unknown"),
      output: Array.isArray(picked.output) ? picked.output : [],
      usage: picked.usage ?? usage ?? null,
      status: toString(picked.status, completed ? "completed" : "in_progress"),
      created_at: toNumber(picked.created_at, Math.floor(Date.now() / 1000)),
      metadata: asRecord(picked.metadata),
    };
  }

  return {
    id: `resp_${Date.now()}`,
    object: "response",
    model: fallbackModel || "unknown",
    output:
      textParts.length > 0
        ? [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: textParts.join("") }],
            },
          ]
        : [],
    usage: usage ?? null,
    status: "completed",
    created_at: Math.floor(Date.now() / 1000),
    metadata: {},
  };
}
