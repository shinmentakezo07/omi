import { cloneLogPayload } from "@/lib/logPayloads";
import { FORMATS } from "../translator/formats.ts";
import { createStreamDeltaAccumulator } from "./streamDeltaAccumulator.ts";
import {
  buildChatCompletionResult,
  buildClaudeMessageResult,
  buildResponsesSummaryFromPayloads,
} from "./streamFinalizer.ts";

type StructuredSSEEvent = {
  index: number;
  event?: string;
  data: unknown;
};

type CollectorOptions = {
  maxEvents?: number;
  maxBytes?: number;
  stage?: string;
};

type BuildOptions = {
  includeEvents?: boolean;
};

type JsonRecord = Record<string, unknown>;

function getEventName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  if (typeof (payload as { event?: unknown }).event === "string") {
    return (payload as { event: string }).event;
  }
  if (typeof (payload as { type?: unknown }).type === "string") {
    return (payload as { type: string }).type;
  }
  if ((payload as { done?: unknown }).done === true) {
    return "[DONE]";
  }
  return undefined;
}

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

function normalizeFormat(format?: string | null): string {
  if (!format) return "";
  if (format === FORMATS.OPENAI_RESPONSE) return FORMATS.OPENAI_RESPONSES;
  return format;
}

function inferFormatFromEvents(
  events: StructuredSSEEvent[],
  fallbackFormat?: string | null
): string {
  const normalizedFallback = normalizeFormat(fallbackFormat);
  if (normalizedFallback) return normalizedFallback;

  for (const evt of events) {
    const payload = asRecord(evt.data);
    const eventType = toString(payload.type || evt.event);

    if (eventType.startsWith("response.") || payload.object === "response") {
      return FORMATS.OPENAI_RESPONSES;
    }
    if (
      eventType === "message_start" ||
      eventType === "content_block_start" ||
      eventType === "content_block_delta" ||
      eventType === "message_delta" ||
      eventType === "message_stop" ||
      eventType === "ping"
    ) {
      return FORMATS.CLAUDE;
    }
    if (Array.isArray(payload.candidates) || payload.usageMetadata) {
      return FORMATS.GEMINI;
    }
  }

  return FORMATS.OPENAI;
}

function mergeUsage(target: JsonRecord, incoming: unknown) {
  const usage = asRecord(incoming);
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      if ((target[key] as number | undefined) === undefined || value > 0) {
        target[key] = value;
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = { ...asRecord(target[key]), ...asRecord(value) };
    } else if (typeof value === "string" && value.trim().length > 0) {
      target[key] = value;
    }
  }
}

function buildOpenAISummary(events: StructuredSSEEvent[], fallbackModel?: string | null): unknown {
  const payloads = events
    .map((evt) => asRecord(evt.data))
    .filter((payload) => Object.keys(payload).length);
  if (payloads.length === 0) return null;

  const acc = createStreamDeltaAccumulator({ format: FORMATS.OPENAI });
  for (const payload of payloads) acc.ingest(payload);
  const snapshot = acc.getSnapshot();
  const first = payloads[0];

  return buildChatCompletionResult({
    id: snapshot.id || first.id,
    created: first.created,
    model: snapshot.model || first.model,
    fallbackModel,
    message: snapshot.message,
    usage: snapshot.usage,
    finishReason: snapshot.finishReason,
  });
}

function buildResponsesSummary(
  events: StructuredSSEEvent[],
  fallbackModel?: string | null
): unknown {
  const payloads = events
    .map((evt) => asRecord(evt.data))
    .filter((payload) => Object.keys(payload).length);
  return buildResponsesSummaryFromPayloads(payloads, fallbackModel);
}

function buildClaudeSummary(events: StructuredSSEEvent[], fallbackModel?: string | null): unknown {
  const payloads = events
    .map((evt) => asRecord(evt.data))
    .filter((payload) => Object.keys(payload).length);
  if (payloads.length === 0) return null;

  const acc = createStreamDeltaAccumulator({ format: FORMATS.CLAUDE });
  for (const payload of payloads) acc.ingest(payload);
  const snapshot = acc.getSnapshot();

  return buildClaudeMessageResult({
    id: snapshot.id,
    model: snapshot.model,
    role: snapshot.role,
    content: Array.isArray(snapshot.message.content) ? snapshot.message.content : [],
    stopReason: snapshot.finishReason,
    stopSequence: snapshot.stopSequence,
    usage: snapshot.usage,
    fallbackModel,
  });
}

function buildGeminiSummary(events: StructuredSSEEvent[], fallbackModel?: string | null): unknown {
  const payloads = events
    .map((evt) => asRecord(evt.data))
    .filter((payload) => Object.keys(payload).length);
  if (payloads.length === 0) return null;

  const parts: JsonRecord[] = [];
  const usageMetadata: JsonRecord = {};
  let modelVersion = fallbackModel || "gemini";
  let finishReason = "STOP";
  let role = "model";

  const appendPart = (part: JsonRecord) => {
    const last = parts[parts.length - 1];
    if (
      last &&
      typeof last.text === "string" &&
      typeof part.text === "string" &&
      Boolean(last.thought) === Boolean(part.thought)
    ) {
      last.text += part.text;
      return;
    }
    parts.push(part);
  };

  for (const payload of payloads) {
    if (typeof payload.modelVersion === "string" && payload.modelVersion.length > 0) {
      modelVersion = payload.modelVersion;
    }
    mergeUsage(usageMetadata, payload.usageMetadata);

    const candidate = asRecord(Array.isArray(payload.candidates) ? payload.candidates[0] : null);
    if (typeof candidate.finishReason === "string" && candidate.finishReason.length > 0) {
      finishReason = candidate.finishReason;
    }

    const content = asRecord(candidate.content);
    if (typeof content.role === "string" && content.role.length > 0) {
      role = content.role;
    }

    if (!Array.isArray(content.parts)) continue;
    for (const item of content.parts) {
      const part = asRecord(item);
      if (part.functionCall && typeof part.functionCall === "object") {
        parts.push({
          functionCall: cloneLogPayload(part.functionCall),
        });
      } else if (typeof part.text === "string" && part.text.length > 0) {
        appendPart({
          text: part.text,
          ...(part.thought === true ? { thought: true } : {}),
        });
      }
    }
  }

  return {
    candidates: [
      {
        index: 0,
        content: {
          role,
          parts,
        },
        finishReason,
      },
    ],
    ...(Object.keys(usageMetadata).length > 0 ? { usageMetadata } : {}),
    modelVersion,
  };
}

export function buildStreamSummaryFromEvents(
  events: StructuredSSEEvent[],
  fallbackFormat?: string | null,
  fallbackModel?: string | null
): unknown {
  const format = inferFormatFromEvents(events, fallbackFormat);

  switch (format) {
    case FORMATS.OPENAI_RESPONSES:
      return buildResponsesSummary(events, fallbackModel);
    case FORMATS.CLAUDE:
      return buildClaudeSummary(events, fallbackModel);
    case FORMATS.GEMINI:
    case FORMATS.GEMINI_CLI:
    case FORMATS.ANTIGRAVITY:
      return buildGeminiSummary(events, fallbackModel);
    default:
      return buildOpenAISummary(events, fallbackModel);
  }
}

export function compactStructuredStreamPayload(payload: unknown): unknown {
  const record = asRecord(payload);
  if (record._streamed !== true || !("summary" in record)) {
    return payload;
  }

  const streamMeta: JsonRecord = {
    format: toString(record._format, "sse-json"),
    stage: toString(record._stage, "response"),
    eventCount: toNumber(record._eventCount, 0),
  };
  if (record._truncated === true) {
    streamMeta.truncated = true;
  }
  if (typeof record._droppedEvents === "number" && record._droppedEvents > 0) {
    streamMeta.droppedEvents = record._droppedEvents;
  }

  const summary = cloneLogPayload(record.summary);
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    return {
      ...(summary as JsonRecord),
      _omniroute_stream: streamMeta,
    };
  }

  return {
    summary,
    _omniroute_stream: streamMeta,
  };
}

export function createStructuredSSECollector(options: CollectorOptions = {}) {
  const { maxEvents = 200, maxBytes = 49152, stage } = options;
  const events: StructuredSSEEvent[] = [];
  let usedBytes = 0;
  let droppedEvents = 0;

  return {
    push(payload: unknown, explicitEvent?: string) {
      if (payload === null || payload === undefined) return;

      const event: StructuredSSEEvent = {
        index: events.length + droppedEvents,
        data: cloneLogPayload(payload),
      };

      const eventName = explicitEvent || getEventName(payload);
      if (eventName) {
        event.event = eventName;
      }

      const serializedSize = JSON.stringify(event).length;
      if (events.length >= maxEvents || usedBytes + serializedSize > maxBytes) {
        droppedEvents += 1;
        return;
      }

      usedBytes += serializedSize;
      events.push(event);
    },

    getEvents() {
      return events.map((event) => cloneLogPayload(event));
    },

    build(summary?: unknown, buildOptions: BuildOptions = {}) {
      const { includeEvents = true } = buildOptions;
      return {
        _streamed: true,
        _format: "sse-json",
        ...(stage ? { _stage: stage } : {}),
        _eventCount: events.length + droppedEvents,
        ...(droppedEvents > 0 ? { _truncated: true, _droppedEvents: droppedEvents } : {}),
        ...(includeEvents ? { events } : {}),
        ...(summary === undefined ? {} : { summary: cloneLogPayload(summary) }),
      };
    },
  };
}
