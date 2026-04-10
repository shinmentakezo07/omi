import { FORMATS } from "../translator/formats.ts";
import { createStreamDeltaAccumulator } from "../utils/streamDeltaAccumulator.ts";
import { logger } from "../utils/logger.ts";
import {
  buildChatCompletionResult,
  buildClaudeMessageResult,
  buildResponsesSummaryFromPayloads,
} from "../utils/streamFinalizer.ts";

const sseParserLogger = logger("SSE_PARSER");
const MAX_MALFORMED_PAYLOAD_WARNINGS = 3;

function createMalformedPayloadLogger(context) {
  let warningCount = 0;
  return (payload) => {
    if (!payload) return;
    if (warningCount >= MAX_MALFORMED_PAYLOAD_WARNINGS) return;
    warningCount += 1;
    sseParserLogger.warn("Ignoring malformed SSE payload", {
      context,
      length: payload.length,
      occurrence: warningCount,
    });
  };
}

/**
 * Convert OpenAI-style SSE chunks into a single non-streaming JSON response.
 * Used as a fallback when upstream returns text/event-stream for stream=false.
 */
function readSSEEvents(rawSSE) {
  const warnMalformedPayload = createMalformedPayloadLogger("readSSEEvents");
  const lines = String(rawSSE || "").split("\n");
  const events = [];
  let currentEvent = "";
  let currentData = [];

  const flush = () => {
    if (currentData.length === 0) {
      currentEvent = "";
      return;
    }

    const payload = currentData.join("\n").trim();
    currentData = [];
    if (!payload || payload === "[DONE]") {
      currentEvent = "";
      return;
    }

    try {
      events.push({
        event: currentEvent || undefined,
        data: JSON.parse(payload),
      });
    } catch {
      warnMalformedPayload(payload);
    }

    currentEvent = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.trim() === "") {
      flush();
      continue;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      currentData.push(line.slice(5).trimStart());
    }
  }

  flush();
  return events;
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function parseSSEToOpenAIResponse(rawSSE, fallbackModel) {
  const warnMalformedPayload = createMalformedPayloadLogger("parseSSEToOpenAIResponse");
  const lines = String(rawSSE || "").split("\n");
  const chunks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(payload));
    } catch {
      warnMalformedPayload(payload);
    }
  }

  if (chunks.length === 0) return null;

  const first = chunks[0];
  const acc = createStreamDeltaAccumulator({ format: FORMATS.OPENAI });
  for (const chunk of chunks) acc.ingest(chunk);
  const snapshot = acc.getSnapshot();

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

/**
 * Convert Claude-style SSE events into a single non-streaming message object.
 * Used when Claude-compatible upstreams stream even for stream=false.
 */
export function parseSSEToClaudeResponse(rawSSE, fallbackModel) {
  const payloads = readSSEEvents(rawSSE)
    .map((event) => toRecord(event.data))
    .filter((payload) => Object.keys(payload).length > 0);

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

/**
 * Convert Responses API SSE events into a single non-streaming response object.
 * Expects events such as response.created / response.in_progress / response.completed.
 */
export function parseSSEToResponsesOutput(rawSSE, fallbackModel) {
  const warnMalformedPayload = createMalformedPayloadLogger("parseSSEToResponsesOutput");
  const lines = String(rawSSE || "").split("\n");
  const payloads = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(payload));
    } catch {
      warnMalformedPayload(payload);
    }
  }

  return buildResponsesSummaryFromPayloads(payloads, fallbackModel);
}
