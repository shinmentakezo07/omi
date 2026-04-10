import { cloneLogPayload } from "@/lib/logPayloads";
import { FORMATS } from "../translator/formats.ts";
import { mergeUsageSnapshot } from "./streamFinalizer.ts";

type JsonRecord = Record<string, unknown>;

type NormalizedToolCall = {
  id: string | null;
  index: number;
  type: string;
  function: { name: string; arguments: string };
};

type ClaudeBlock =
  | { type: "text"; index: number; text: string }
  | { type: "thinking"; index: number; thinking: string; signature?: string }
  | {
      type: "tool_use";
      index: number;
      id: string;
      name: string;
      input: unknown;
      inputJson: string;
    };

type StreamAccumulatorSnapshot = {
  format: string;
  id: string | null;
  model: string | null;
  role: string;
  finishReason: string | null;
  stopSequence: string | null;
  usage: JsonRecord | null;
  message: JsonRecord;
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

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function normalizeToolCallKey(toolCall: JsonRecord, sequence: number): string {
  if (Number.isInteger(toolCall.index)) return `idx:${toolCall.index}`;
  if (typeof toolCall.id === "string" && toolCall.id.length > 0) return `id:${toolCall.id}`;
  return `seq:${sequence}`;
}

export function createStreamDeltaAccumulator({ format }: { format: string }) {
  const normalizedFormat = format === FORMATS.OPENAI_RESPONSE ? FORMATS.OPENAI_RESPONSES : format;
  const state = {
    format: normalizedFormat,
    id: null as string | null,
    model: null as string | null,
    role: "assistant",
    finishReason: null as string | null,
    stopSequence: null as string | null,
    usage: null as JsonRecord | null,
    contentParts: [] as string[],
    reasoningParts: [] as string[],
    toolCalls: new Map<string, NormalizedToolCall>(),
    toolCallSeq: 0,
    claudeBlocks: new Map<number, ClaudeBlock>(),
  };

  function ingestOpenAI(payload: JsonRecord) {
    if (typeof payload.id === "string" && payload.id.length > 0) state.id = payload.id;
    if (typeof payload.model === "string" && payload.model.length > 0) state.model = payload.model;

    const choice = asRecord(Array.isArray(payload.choices) ? payload.choices[0] : null);
    const delta = asRecord(choice.delta);

    if (typeof delta.role === "string" && delta.role.length > 0) {
      state.role = delta.role;
    }
    if (typeof delta.content === "string" && delta.content.length > 0) {
      state.contentParts.push(delta.content);
    }
    if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        const partRecord = asRecord(part);
        if (typeof partRecord.text === "string" && partRecord.text.length > 0) {
          state.contentParts.push(partRecord.text);
        }
      }
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      state.reasoningParts.push(delta.reasoning_content);
    }
    if (
      typeof delta.reasoning === "string" &&
      delta.reasoning.length > 0 &&
      !delta.reasoning_content
    ) {
      state.reasoningParts.push(delta.reasoning);
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const item of delta.tool_calls) {
        const toolCall = asRecord(item);
        const key = normalizeToolCallKey(toolCall, ++state.toolCallSeq);
        const existing = state.toolCalls.get(key);
        const deltaArgs =
          typeof asRecord(toolCall.function).arguments === "string"
            ? String(asRecord(toolCall.function).arguments)
            : "";

        if (!existing) {
          state.toolCalls.set(key, {
            id: typeof toolCall.id === "string" ? toolCall.id : null,
            index: Number.isInteger(toolCall.index) ? Number(toolCall.index) : state.toolCalls.size,
            type: toString(toolCall.type, "function"),
            function: {
              name: toString(asRecord(toolCall.function).name, "unknown"),
              arguments: deltaArgs,
            },
          });
          continue;
        }

        existing.id = existing.id || (typeof toolCall.id === "string" ? toolCall.id : null);
        if (
          (!Number.isInteger(existing.index) || existing.index < 0) &&
          Number.isInteger(toolCall.index)
        ) {
          existing.index = Number(toolCall.index);
        }
        if (typeof asRecord(toolCall.function).name === "string" && !existing.function.name) {
          existing.function.name = String(asRecord(toolCall.function).name);
        }
        existing.function.arguments += deltaArgs;
      }
    }

    if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) {
      state.finishReason = choice.finish_reason;
    }
    if (payload.usage && typeof payload.usage === "object") {
      state.usage = mergeUsageSnapshot(state.usage, asRecord(payload.usage));
    }
  }

  function ingestClaude(payload: JsonRecord) {
    const eventType = toString(payload.type);
    if (eventType === "message_start") {
      const message = asRecord(payload.message);
      state.id = toString(message.id, state.id || "") || state.id;
      state.model = toString(message.model, state.model || "") || state.model;
      state.role = toString(message.role, state.role);
      state.usage = mergeUsageSnapshot(state.usage, asRecord(message.usage));
      return;
    }

    if (eventType === "content_block_start") {
      const index = toNumber(payload.index, state.claudeBlocks.size);
      const contentBlock = asRecord(payload.content_block);
      const blockType = toString(contentBlock.type);

      if (blockType === "thinking") {
        state.claudeBlocks.set(index, {
          type: "thinking",
          index,
          thinking: toString(contentBlock.thinking),
          signature:
            typeof contentBlock.signature === "string" ? contentBlock.signature : undefined,
        });
      } else if (blockType === "tool_use") {
        state.claudeBlocks.set(index, {
          type: "tool_use",
          index,
          id: toString(contentBlock.id, `toolu_${Date.now()}_${index}`),
          name: toString(contentBlock.name),
          input: cloneLogPayload(contentBlock.input ?? {}),
          inputJson: "",
        });
      } else {
        state.claudeBlocks.set(index, {
          type: "text",
          index,
          text: toString(contentBlock.text),
        });
      }
      return;
    }

    if (eventType === "content_block_delta") {
      const index = toNumber(payload.index, 0);
      const delta = asRecord(payload.delta);
      const deltaType = toString(delta.type);
      const existing = state.claudeBlocks.get(index);

      if (deltaType === "input_json_delta") {
        const toolUse =
          existing && existing.type === "tool_use"
            ? existing
            : {
                type: "tool_use" as const,
                index,
                id: `toolu_${Date.now()}_${index}`,
                name: "",
                input: {},
                inputJson: "",
              };
        toolUse.inputJson += toString(delta.partial_json);
        state.claudeBlocks.set(index, toolUse);
        return;
      }

      if (deltaType === "thinking_delta" || typeof delta.thinking === "string") {
        const thinking =
          existing && existing.type === "thinking"
            ? existing
            : { type: "thinking" as const, index, thinking: "", signature: undefined };
        thinking.thinking += toString(delta.thinking);
        state.claudeBlocks.set(index, thinking);
        return;
      }

      const textBlock =
        existing && existing.type === "text"
          ? existing
          : {
              type: "text" as const,
              index,
              text: "",
            };
      textBlock.text += toString(delta.text);
      state.claudeBlocks.set(index, textBlock);
      return;
    }

    if (eventType === "message_delta") {
      const delta = asRecord(payload.delta);
      state.finishReason =
        toString(delta.stop_reason, state.finishReason || "") || state.finishReason;
      state.stopSequence =
        typeof delta.stop_sequence === "string" ? String(delta.stop_sequence) : state.stopSequence;
      state.usage = mergeUsageSnapshot(state.usage, asRecord(payload.usage));
      return;
    }

    if (payload.usage && typeof payload.usage === "object") {
      state.usage = mergeUsageSnapshot(state.usage, asRecord(payload.usage));
    }
  }

  return {
    ingest(payload: JsonRecord) {
      if (state.format === FORMATS.CLAUDE) {
        ingestClaude(payload);
        return;
      }
      ingestOpenAI(payload);
    },

    getSnapshot(): StreamAccumulatorSnapshot {
      if (state.format === FORMATS.CLAUDE) {
        const content = [...state.claudeBlocks.values()]
          .sort((a, b) => a.index - b.index)
          .flatMap((block) => {
            if (block.type === "text") {
              return block.text ? [{ type: "text", text: block.text }] : [];
            }
            if (block.type === "thinking") {
              return block.thinking
                ? [
                    {
                      type: "thinking",
                      thinking: block.thinking,
                      ...(block.signature ? { signature: block.signature } : {}),
                    },
                  ]
                : [];
            }

            const parsedInput =
              block.inputJson.trim().length > 0
                ? tryParseJson(block.inputJson)
                : cloneLogPayload(block.input);
            return [
              {
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: parsedInput,
              },
            ];
          });

        return {
          format: state.format,
          id: state.id,
          model: state.model,
          role: state.role,
          finishReason: state.finishReason,
          stopSequence: state.stopSequence,
          usage: state.usage,
          message: {
            role: state.role,
            content,
          },
        };
      }

      const content = state.contentParts.length > 0 ? state.contentParts.join("").trim() : null;
      const reasoning =
        state.reasoningParts.length > 0 ? state.reasoningParts.join("").trim() : null;
      const toolCalls = [...state.toolCalls.values()].sort((a, b) => a.index - b.index);

      return {
        format: state.format,
        id: state.id,
        model: state.model,
        role: state.role,
        finishReason: toolCalls.length > 0 ? "tool_calls" : state.finishReason,
        stopSequence: state.stopSequence,
        usage: state.usage,
        message: {
          role: state.role,
          content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
      };
    },
  };
}
