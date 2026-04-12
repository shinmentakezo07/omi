import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";

function normalizeToolName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildOutputTextPart(text) {
  return { type: "output_text", annotations: [], logprobs: [], text };
}

function sortedNumericKeys(record) {
  return Object.keys(record).sort((a, b) => Number(a) - Number(b));
}

function buildCompletedOutput(state) {
  const output = [];

  if (state.reasoningId) {
    output.push({
      id: state.reasoningId,
      type: "reasoning",
      summary: [{ type: "summary_text", text: state.reasoningBuf }],
    });
  }

  for (const idx of sortedNumericKeys(state.msgItemAdded)) {
    output.push({
      id: `msg_${state.responseId}_${idx}`,
      type: "message",
      role: "assistant",
      content: [buildOutputTextPart(state.msgTextBuf[idx] || "")],
    });
  }

  for (const idx of sortedNumericKeys(state.funcCallIds)) {
    const callId = state.funcCallIds[idx];
    output.push({
      id: `fc_${callId}`,
      type: "function_call",
      call_id: callId,
      name: state.funcNames[idx] || "",
      arguments: state.funcArgsBuf[idx] || "{}",
    });
  }

  return output;
}

/**
 * Translate OpenAI chunk to Responses API events
 * @returns {Array} Array of events with { event, data } structure
 */
export function openaiToOpenAIResponsesResponse(chunk, state) {
  if (!chunk) {
    return flushEvents(state);
  }

  if (chunk.usage) {
    const u = chunk.usage;
    const input_tokens = u.input_tokens ?? u.prompt_tokens ?? 0;
    const output_tokens = u.output_tokens ?? u.completion_tokens ?? 0;
    state.usage = {
      input_tokens,
      output_tokens,
      total_tokens: u.total_tokens ?? input_tokens + output_tokens,
    };
    if (u.prompt_tokens_details?.cached_tokens) {
      state.usage.input_tokens_details = { cached_tokens: u.prompt_tokens_details.cached_tokens };
    }
  }

  if (!chunk.choices?.length) {
    return [];
  }

  const events = [];
  const nextSeq = () => ++state.seq;

  const emit = (eventType, data) => {
    data.sequence_number = nextSeq();
    events.push({ event: eventType, data });
  };

  const choice = chunk.choices[0];
  const idx = choice.index || 0;
  const delta = choice.delta || {};
  state.model = chunk.model || state.model;

  if (!state.started) {
    state.started = true;
    state.responseId = chunk.id ? `resp_${chunk.id}` : state.responseId;

    emit("response.created", {
      type: "response.created",
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "in_progress",
        background: false,
        error: null,
        output: [],
        ...(state.model ? { model: state.model } : {}),
      },
    });

    emit("response.in_progress", {
      type: "response.in_progress",
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "in_progress",
        ...(state.model ? { model: state.model } : {}),
      },
    });
  }

  if (delta.reasoning_content) {
    startReasoning(state, emit, idx);
    emitReasoningDelta(state, emit, delta.reasoning_content);
  }

  if (delta.content) {
    let content = delta.content;

    if (content.includes("<think>")) {
      state.inThinking = true;
      content = content.replaceAll("<think>", "");
      startReasoning(state, emit, idx);
    }

    if (content.includes("</think>")) {
      const parts = content.split("</think>");
      const thinkPart = parts[0];
      const textPart = parts.slice(1).join("</think>");
      if (thinkPart) emitReasoningDelta(state, emit, thinkPart);
      closeReasoning(state, emit);
      state.inThinking = false;
      content = textPart;
    }

    if (state.inThinking && content) {
      emitReasoningDelta(state, emit, content);
      return events;
    }

    if (content) {
      emitTextContent(state, emit, idx, content);
    }
  }

  if (delta.tool_calls) {
    closeMessage(state, emit, idx);
    for (const tc of delta.tool_calls) {
      emitToolCall(state, emit, tc);
    }
  }

  if (choice.finish_reason) {
    if (choice.finish_reason === "length") {
      state.status = "incomplete";
      state.incomplete_details = { reason: "max_output_tokens" };
    } else {
      state.status = "completed";
      state.incomplete_details = null;
    }

    for (const i in state.msgItemAdded) closeMessage(state, emit, i);
    closeReasoning(state, emit);
    for (const i in state.funcCallIds) closeToolCall(state, emit, i);
    sendCompleted(state, emit);
  }

  return events;
}

function startReasoning(state, emit, idx) {
  if (!state.reasoningId) {
    state.reasoningId = `rs_${state.responseId}_${idx}`;
    state.reasoningIndex = idx;

    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: idx,
      item: { id: state.reasoningId, type: "reasoning", summary: [] },
    });

    emit("response.reasoning_summary_part.added", {
      type: "response.reasoning_summary_part.added",
      item_id: state.reasoningId,
      output_index: idx,
      summary_index: 0,
      part: { type: "summary_text", text: "" },
    });
    state.reasoningPartAdded = true;
  }
}

function emitReasoningDelta(state, emit, text) {
  if (!text) return;
  state.reasoningBuf += text;
  emit("response.reasoning_summary_text.delta", {
    type: "response.reasoning_summary_text.delta",
    item_id: state.reasoningId,
    output_index: state.reasoningIndex,
    summary_index: 0,
    delta: text,
  });
}

function closeReasoning(state, emit) {
  if (state.reasoningId && !state.reasoningDone) {
    state.reasoningDone = true;

    emit("response.reasoning_summary_text.done", {
      type: "response.reasoning_summary_text.done",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      text: state.reasoningBuf,
    });

    emit("response.reasoning_summary_part.done", {
      type: "response.reasoning_summary_part.done",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      part: { type: "summary_text", text: state.reasoningBuf },
    });

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: state.reasoningIndex,
      item: {
        id: state.reasoningId,
        type: "reasoning",
        summary: [{ type: "summary_text", text: state.reasoningBuf }],
      },
    });
  }
}

function emitTextContent(state, emit, idx, content) {
  if (!state.msgItemAdded[idx]) {
    state.msgItemAdded[idx] = true;
    const msgId = `msg_${state.responseId}_${idx}`;

    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: idx,
      item: { id: msgId, type: "message", content: [], role: "assistant" },
    });
  }

  if (!state.msgContentAdded[idx]) {
    state.msgContentAdded[idx] = true;

    emit("response.content_part.added", {
      type: "response.content_part.added",
      item_id: `msg_${state.responseId}_${idx}`,
      output_index: idx,
      content_index: 0,
      part: buildOutputTextPart(""),
    });
  }

  emit("response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: `msg_${state.responseId}_${idx}`,
    output_index: idx,
    content_index: 0,
    delta: content,
    logprobs: [],
  });

  if (!state.msgTextBuf[idx]) state.msgTextBuf[idx] = "";
  state.msgTextBuf[idx] += content;
}

function closeMessage(state, emit, idx) {
  if (state.msgItemAdded[idx] && !state.msgItemDone[idx]) {
    state.msgItemDone[idx] = true;
    const fullText = state.msgTextBuf[idx] || "";
    const msgId = `msg_${state.responseId}_${idx}`;

    emit("response.output_text.done", {
      type: "response.output_text.done",
      item_id: msgId,
      output_index: parseInt(idx),
      content_index: 0,
      text: fullText,
      logprobs: [],
    });

    emit("response.content_part.done", {
      type: "response.content_part.done",
      item_id: msgId,
      output_index: parseInt(idx),
      content_index: 0,
      part: buildOutputTextPart(fullText),
    });

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: parseInt(idx),
      item: {
        id: msgId,
        type: "message",
        content: [buildOutputTextPart(fullText)],
        role: "assistant",
      },
    });
  }
}

function emitToolCall(state, emit, tc) {
  const tcIdx = tc.index ?? 0;
  const newCallId = tc.id;
  const funcName = tc.function?.name;

  if (state.funcCallIds[tcIdx] && newCallId && state.funcCallIds[tcIdx] !== newCallId) {
    closeToolCall(state, emit, tcIdx);
    delete state.funcCallIds[tcIdx];
    delete state.funcNames[tcIdx];
    delete state.funcArgsBuf[tcIdx];
    delete state.funcArgsDone[tcIdx];
    delete state.funcItemDone[tcIdx];
  }

  if (funcName) state.funcNames[tcIdx] = funcName;

  if (!state.funcCallIds[tcIdx] && newCallId) {
    state.funcCallIds[tcIdx] = newCallId;

    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: tcIdx,
      item: {
        id: `fc_${newCallId}`,
        type: "function_call",
        arguments: "",
        call_id: newCallId,
        name: state.funcNames[tcIdx] || "",
      },
    });
  }

  if (!state.funcArgsBuf[tcIdx]) state.funcArgsBuf[tcIdx] = "";

  if (tc.function?.arguments) {
    const refCallId = state.funcCallIds[tcIdx] || newCallId;
    if (refCallId) {
      emit("response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta",
        item_id: `fc_${refCallId}`,
        output_index: tcIdx,
        delta: tc.function.arguments,
      });
    }
    state.funcArgsBuf[tcIdx] += tc.function.arguments;
  }
}

function closeToolCall(state, emit, idx) {
  const callId = state.funcCallIds[idx];
  if (callId && !state.funcItemDone[idx]) {
    const args = state.funcArgsBuf[idx] || "{}";

    emit("response.function_call_arguments.done", {
      type: "response.function_call_arguments.done",
      item_id: `fc_${callId}`,
      output_index: parseInt(idx),
      arguments: args,
    });

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: parseInt(idx),
      item: {
        id: `fc_${callId}`,
        type: "function_call",
        arguments: args,
        call_id: callId,
        name: state.funcNames[idx] || "",
      },
    });

    state.funcItemDone[idx] = true;
    state.funcArgsDone[idx] = true;
  }
}

function sendCompleted(state, emit) {
  if (!state.completedSent) {
    state.completedSent = true;

    const response = {
      id: state.responseId,
      object: "response",
      created_at: state.created,
      status: state.status || "completed",
      background: false,
      error: null,
      output: buildCompletedOutput(state),
      ...(state.model ? { model: state.model } : {}),
    };

    if (state.incomplete_details) {
      response.incomplete_details = state.incomplete_details;
    }

    if (state.usage) {
      response.usage = state.usage;
    }

    const firstMessageKey = sortedNumericKeys(state.msgItemAdded)[0];
    if (firstMessageKey !== undefined) {
      response.output_text = state.msgTextBuf[firstMessageKey] || "";
    }

    emit("response.completed", {
      type: "response.completed",
      response,
    });
  }
}

function flushEvents(state) {
  if (state.completedSent) return [];

  const events = [];
  const nextSeq = () => ++state.seq;
  const emit = (eventType, data) => {
    data.sequence_number = nextSeq();
    events.push({ event: eventType, data });
  };

  for (const i in state.msgItemAdded) closeMessage(state, emit, i);
  closeReasoning(state, emit);
  for (const i in state.funcCallIds) closeToolCall(state, emit, i);
  sendCompleted(state, emit);

  return events;
}

function getResponseToolCallOutputIndex(data, fallback = 0) {
  if (typeof data?.output_index === "number") return data.output_index;
  return fallback;
}

function ensureResponseToolCallState(state, outputIndex) {
  if (!state.responseToolCalls) {
    state.responseToolCalls = new Map();
  }
  if (!state.responseToolCallOrder) {
    state.responseToolCallOrder = [];
  }

  const numericIndex = Number(outputIndex);
  if (!state.responseToolCalls.has(numericIndex)) {
    state.responseToolCalls.set(numericIndex, {
      outputIndex: numericIndex,
      callId: null,
      name: "",
      argsBuffer: "",
      deferred: false,
    });
  }
  if (!state.responseToolCallOrder.includes(numericIndex)) {
    state.responseToolCallOrder.push(numericIndex);
  }

  return state.responseToolCalls.get(numericIndex);
}

/**
 * Translate OpenAI Responses API chunk to OpenAI Chat Completions format
 * This is for when Codex returns data and we need to send it to an OpenAI-compatible client
 */
export function openaiResponsesToOpenAIResponse(chunk, state) {
  if (!chunk) {
    if (!state.finishReasonSent && state.started) {
      state.finishReasonSent = true;
      const hadToolCalls =
        Array.isArray(state.responseToolCallOrder) && state.responseToolCallOrder.length > 0;
      return {
        id: state.chatId || `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: state.created || Math.floor(Date.now() / 1000),
        model: state.model || "gpt-4",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: hadToolCalls ? "tool_calls" : "stop",
          },
        ],
      };
    }
    return null;
  }

  const eventType = chunk.type || chunk.event;
  const data = chunk.data || chunk;

  if (!state.started) {
    state.started = true;
    state.chatId = `chatcmpl-${Date.now()}`;
    state.created = Math.floor(Date.now() / 1000);
    state.responseToolCallOrder = [];
    state.responseToolCalls = new Map();
  }

  if (data.response?.model) {
    state.model = data.response.model;
  }

  if (eventType === "response.output_text.delta") {
    const delta = data.delta || "";
    if (!delta) return null;

    return {
      id: state.chatId,
      object: "chat.completion.chunk",
      created: state.created,
      model: state.model || "gpt-4",
      choices: [
        {
          index: 0,
          delta: { content: delta },
          finish_reason: null,
        },
      ],
    };
  }

  if (eventType === "response.output_text.done") {
    return null;
  }

  if (eventType === "response.output_item.added" && data.item?.type === "function_call") {
    const item = data.item;
    const outputIndex = getResponseToolCallOutputIndex(data, state.responseToolCallOrder.length);
    const toolState = ensureResponseToolCallState(state, outputIndex);
    toolState.callId = item.call_id || toolState.callId || `call_${Date.now()}`;
    toolState.name = normalizeToolName(item.name) || toolState.name;
    toolState.argsBuffer = "";
    toolState.deferred = !toolState.name;

    if (toolState.deferred) {
      return null;
    }

    return {
      id: state.chatId,
      object: "chat.completion.chunk",
      created: state.created,
      model: state.model || "gpt-4",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: outputIndex,
                id: toolState.callId,
                type: "function",
                function: {
                  name: toolState.name,
                  arguments: "",
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
  }

  if (eventType === "response.function_call_arguments.delta") {
    const argsDelta = data.delta || "";
    if (!argsDelta) return null;

    const outputIndex = getResponseToolCallOutputIndex(data, 0);
    const toolState = ensureResponseToolCallState(state, outputIndex);
    toolState.argsBuffer += argsDelta;

    if (toolState.deferred) return null;

    return {
      id: state.chatId,
      object: "chat.completion.chunk",
      created: state.created,
      model: state.model || "gpt-4",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: outputIndex,
                function: { arguments: argsDelta },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
  }

  if (eventType === "response.output_item.done" && data.item?.type === "function_call") {
    const item = data.item;
    const outputIndex = getResponseToolCallOutputIndex(data, 0);
    const toolState = ensureResponseToolCallState(state, outputIndex);
    toolState.callId = item.call_id || toolState.callId || `call_${Date.now()}`;
    toolState.name = normalizeToolName(item.name) || toolState.name;

    if (toolState.deferred) {
      toolState.deferred = false;
      if (!toolState.name) {
        return null;
      }

      const argsStr =
        item.arguments != null
          ? typeof item.arguments === "string"
            ? item.arguments
            : JSON.stringify(item.arguments)
          : toolState.argsBuffer;
      toolState.argsBuffer = argsStr || toolState.argsBuffer;

      return {
        id: state.chatId,
        object: "chat.completion.chunk",
        created: state.created,
        model: state.model || "gpt-4",
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: outputIndex,
                  id: toolState.callId,
                  type: "function",
                  function: {
                    name: toolState.name,
                    arguments: toolState.argsBuffer || "",
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
    }

    if (item.arguments != null && !toolState.argsBuffer) {
      const argsStr =
        typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments);
      toolState.argsBuffer = argsStr || toolState.argsBuffer;
      if (argsStr) {
        return {
          id: state.chatId,
          object: "chat.completion.chunk",
          created: state.created,
          model: state.model || "gpt-4",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: outputIndex,
                    function: { arguments: argsStr },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
      }
    }

    return null;
  }

  if (eventType === "response.completed") {
    const responseUsage = data.response?.usage;
    if (responseUsage && typeof responseUsage === "object") {
      const inputTokens = responseUsage.input_tokens || responseUsage.prompt_tokens || 0;
      const outputTokens = responseUsage.output_tokens || responseUsage.completion_tokens || 0;
      const cacheReadTokens = responseUsage.cache_read_input_tokens || 0;
      const cacheCreationTokens = responseUsage.cache_creation_input_tokens || 0;

      const promptTokens = inputTokens + cacheReadTokens + cacheCreationTokens;

      state.usage = {
        prompt_tokens: promptTokens,
        completion_tokens: outputTokens,
        total_tokens: promptTokens + outputTokens,
      };

      if (cacheReadTokens > 0 || cacheCreationTokens > 0) {
        state.usage.prompt_tokens_details = {};
        if (cacheReadTokens > 0) {
          state.usage.prompt_tokens_details.cached_tokens = cacheReadTokens;
        }
        if (cacheCreationTokens > 0) {
          state.usage.prompt_tokens_details.cache_creation_tokens = cacheCreationTokens;
        }
      }
    }

    if (data.response?.model) {
      state.model = data.response.model;
    }

    if (!state.finishReasonSent) {
      state.finishReasonSent = true;
      const hadToolCalls =
        Array.isArray(state.responseToolCallOrder) && state.responseToolCallOrder.length > 0;
      const reason = hadToolCalls ? "tool_calls" : "stop";
      state.finishReason = reason;

      const finalChunk = {
        id: state.chatId,
        object: "chat.completion.chunk",
        created: state.created,
        model: state.model || "gpt-4",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: reason,
          },
        ],
      };

      if (state.usage && typeof state.usage === "object") {
        finalChunk.usage = state.usage;
      }

      return finalChunk;
    }
    return null;
  }

  if (eventType === "response.reasoning_summary_text.delta") {
    const reasoningDelta = data.delta || "";
    if (!reasoningDelta) return null;
    return {
      id: state.chatId,
      object: "chat.completion.chunk",
      created: state.created,
      model: state.model || "gpt-4",
      choices: [
        {
          index: 0,
          delta: { reasoning_content: reasoningDelta },
          finish_reason: null,
        },
      ],
    };
  }

  return null;
}

register(FORMATS.OPENAI, FORMATS.OPENAI_RESPONSES, null, openaiToOpenAIResponsesResponse);
register(FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI, null, openaiResponsesToOpenAIResponse);
