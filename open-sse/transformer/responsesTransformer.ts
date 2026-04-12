function buildOutputTextPart(text) {
  return { type: "output_text", annotations: [], logprobs: [], text };
}

function sortedNumericKeys(record) {
  return Object.keys(record).sort((a, b) => Number(a) - Number(b));
}

/**
 * Responses API Transformer
 * Converts OpenAI Chat Completions SSE to Codex Responses API SSE format
 * Can be used in both Next.js and Cloudflare Workers
 */

// Dynamic import for Node.js-only modules (fs/path unavailable in Workers)
let _fs = null;
let _path = null;
async function getFs() {
  if (_fs === null) {
    try {
      _fs = (await import("fs")).default;
    } catch {
      _fs = false;
    }
  }
  return _fs || null;
}
async function getPath() {
  if (_path === null) {
    try {
      _path = (await import("path")).default;
    } catch {
      _path = false;
    }
  }
  return _path || null;
}

// Create log directory for responses (Node.js only)
export function createResponsesLogger(model, logsDir = null) {
  if (typeof process === "undefined" || typeof process.getBuiltinModule !== "function") {
    return null;
  }

  const fs = process.getBuiltinModule("fs");
  const path = process.getBuiltinModule("path");

  if (!fs || !path || typeof fs.mkdirSync !== "function" || typeof path.join !== "function") {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const uniqueId = Math.random().toString(36).slice(2, 8);
  const baseDir = logsDir || (typeof process !== "undefined" ? process.cwd() : ".");
  // previous: const baseDir = logsDir || resolveDataDir(); — reverted in #555 for Workers compat
  const logDir = path.join(baseDir, "logs", `responses_${model}_${timestamp}_${uniqueId}`);

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    return null;
  }

  let inputEvents = [];
  let outputEvents = [];

  return {
    logInput: (event) => {
      inputEvents.push(event);
    },
    logOutput: (event) => {
      outputEvents.push(event);
    },
    flush: () => {
      try {
        fs.writeFileSync(path.join(logDir, "1_input_stream.txt"), inputEvents.join("\n"));
        fs.writeFileSync(path.join(logDir, "2_output_stream.txt"), outputEvents.join("\n"));
      } catch (e) {
        console.log("[RESPONSES] Failed to write logs:", e.message);
      }
    },
  };
}

/**
 * Create TransformStream that converts Chat Completions SSE to Responses API SSE
 * @param {Object} logger - Optional logger instance
 * @returns {TransformStream}
 */
export function createResponsesApiTransformStream(logger = null) {
  const state = {
    seq: 0,
    responseId: `resp_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    started: false,
    model: null,
    finishReason: null,
    status: "in_progress",
    incompleteDetails: null,
    responseMetadata: {},
    responseTopLevel: {},
    msgTextBuf: {},
    msgItemAdded: {},
    msgContentAdded: {},
    msgItemDone: {},
    reasoningId: "",
    reasoningIndex: -1,
    reasoningBuf: "",
    reasoningPartAdded: false,
    reasoningDone: false,
    inThinking: false,
    funcArgsBuf: {},
    funcNames: {},
    funcCallIds: {},
    funcArgsDone: {},
    funcItemDone: {},
    buffer: "",
    completedSent: false,
    usage: null,
  };

  const encoder = new TextEncoder();
  const nextSeq = () => ++state.seq;

  const emit = (controller, eventType, data) => {
    data.sequence_number = nextSeq();
    const output = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    logger?.logOutput(output.trim());
    controller.enqueue(encoder.encode(output));
  };

  // Helper to start reasoning
  const startReasoning = (controller, idx) => {
    if (!state.reasoningId) {
      state.reasoningId = `rs_${state.responseId}_${idx}`;
      state.reasoningIndex = idx;

      emit(controller, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: idx,
        item: {
          id: state.reasoningId,
          type: "reasoning",
          summary: [],
        },
      });

      emit(controller, "response.reasoning_summary_part.added", {
        type: "response.reasoning_summary_part.added",
        item_id: state.reasoningId,
        output_index: idx,
        summary_index: 0,
        part: { type: "summary_text", text: "" },
      });
      state.reasoningPartAdded = true;
    }
  };

  const emitReasoningDelta = (controller, text) => {
    if (!text) return;
    state.reasoningBuf += text;
    emit(controller, "response.reasoning_summary_text.delta", {
      type: "response.reasoning_summary_text.delta",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      delta: text,
    });
  };

  const closeReasoning = (controller) => {
    if (state.reasoningId && !state.reasoningDone) {
      state.reasoningDone = true;

      emit(controller, "response.reasoning_summary_text.done", {
        type: "response.reasoning_summary_text.done",
        item_id: state.reasoningId,
        output_index: state.reasoningIndex,
        summary_index: 0,
        text: state.reasoningBuf,
      });

      emit(controller, "response.reasoning_summary_part.done", {
        type: "response.reasoning_summary_part.done",
        item_id: state.reasoningId,
        output_index: state.reasoningIndex,
        summary_index: 0,
        part: { type: "summary_text", text: state.reasoningBuf },
      });

      emit(controller, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: state.reasoningIndex,
        item: {
          id: state.reasoningId,
          type: "reasoning",
          summary: [{ type: "summary_text", text: state.reasoningBuf }],
        },
      });
    }
  };

  const closeMessage = (controller, idx) => {
    if (state.msgItemAdded[idx] && !state.msgItemDone[idx]) {
      state.msgItemDone[idx] = true;
      const fullText = state.msgTextBuf[idx] || "";
      const msgId = `msg_${state.responseId}_${idx}`;

      emit(controller, "response.output_text.done", {
        type: "response.output_text.done",
        item_id: msgId,
        output_index: parseInt(idx),
        content_index: 0,
        text: fullText,
        logprobs: [],
      });

      emit(controller, "response.content_part.done", {
        type: "response.content_part.done",
        item_id: msgId,
        output_index: parseInt(idx),
        content_index: 0,
        part: buildOutputTextPart(fullText),
      });

      emit(controller, "response.output_item.done", {
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
  };

  const buildCompletedOutput = () => {
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
  };

  const buildResponseEnvelope = (statusOverride = state.status) => {
    const response = {
      id: state.responseId,
      object: "response",
      created_at: state.created,
      status: statusOverride,
      background: false,
      error: null,
      output: buildCompletedOutput(),
      ...state.responseTopLevel,
    };

    if (state.model) {
      response.model = state.model;
    }

    if (Object.keys(state.responseMetadata).length > 0) {
      response.metadata = state.responseMetadata;
    }

    if (state.incompleteDetails) {
      response.incomplete_details = state.incompleteDetails;
    }

    if (state.usage) {
      response.usage = state.usage;
    }

    const firstMessageKey = sortedNumericKeys(state.msgItemAdded)[0];
    if (firstMessageKey !== undefined) {
      response.output_text = state.msgTextBuf[firstMessageKey] || "";
    }

    return response;
  };

  const closeToolCall = (controller, idx) => {
    const callId = state.funcCallIds[idx];
    if (callId && !state.funcItemDone[idx]) {
      const args = state.funcArgsBuf[idx] || "{}";

      emit(controller, "response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: `fc_${callId}`,
        output_index: parseInt(idx),
        arguments: args,
      });

      emit(controller, "response.output_item.done", {
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
  };

  const sendCompleted = (controller) => {
    if (!state.completedSent) {
      state.completedSent = true;

      emit(controller, "response.completed", {
        type: "response.completed",
        response: buildResponseEnvelope(state.status),
      });
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      logger?.logInput(text.trim());
      state.buffer += text;

      const messages = state.buffer.split("\n\n");
      state.buffer = messages.pop() || "";

      for (const msg of messages) {
        if (!msg.trim()) continue;

        const dataMatch = msg.match(/^data:\s*(.+)$/m);
        if (!dataMatch) continue;

        const dataStr = dataMatch[1].trim();
        if (dataStr === "[DONE]") continue;

        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (!parsed.choices?.length) {
          if (parsed.usage) {
            state.usage = parsed.usage;
          }
          continue;
        }

        const choice = parsed.choices[0];
        const idx = choice.index || 0;
        const delta = choice.delta || {};
        state.model = parsed.model || state.model;

        if (choice.finish_reason === "length") {
          state.status = "incomplete";
          state.incompleteDetails = { reason: "max_output_tokens" };
          state.finishReason = "length";
        } else if (choice.finish_reason) {
          state.status = "completed";
          state.incompleteDetails = null;
          state.finishReason = choice.finish_reason;
        }

        // Emit initial events
        if (!state.started) {
          state.started = true;
          state.responseId = parsed.id ? `resp_${parsed.id}` : state.responseId;

          emit(controller, "response.created", {
            type: "response.created",
            response: {
              ...buildResponseEnvelope("in_progress"),
              output: [],
              status: "in_progress",
            },
          });

          emit(controller, "response.in_progress", {
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

        // Handle reasoning_content (OpenAI native format)
        if (delta.reasoning_content) {
          startReasoning(controller, idx);
          emitReasoningDelta(controller, delta.reasoning_content);
        }

        // Handle text content (may contain <think> tags)
        if (delta.content) {
          let content = delta.content;

          if (content.includes("<think>")) {
            state.inThinking = true;
            content = content.replaceAll("<think>", "");
            startReasoning(controller, idx);
          }

          if (content.includes("</think>")) {
            const parts = content.split("</think>");
            const thinkPart = parts[0];
            const textPart = parts.slice(1).join("</think>");

            if (thinkPart) emitReasoningDelta(controller, thinkPart);
            closeReasoning(controller);
            state.inThinking = false;
            content = textPart;
          }

          if (state.inThinking && content) {
            emitReasoningDelta(controller, content);
            continue;
          }

          // Regular text content
          if (content) {
            if (!state.msgItemAdded[idx]) {
              state.msgItemAdded[idx] = true;
              const msgId = `msg_${state.responseId}_${idx}`;

              emit(controller, "response.output_item.added", {
                type: "response.output_item.added",
                output_index: idx,
                item: { id: msgId, type: "message", content: [], role: "assistant" },
              });
            }

            if (!state.msgContentAdded[idx]) {
              state.msgContentAdded[idx] = true;

              emit(controller, "response.content_part.added", {
                type: "response.content_part.added",
                item_id: `msg_${state.responseId}_${idx}`,
                output_index: idx,
                content_index: 0,
                part: { type: "output_text", annotations: [], logprobs: [], text: "" },
              });
            }

            emit(controller, "response.output_text.delta", {
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
        }

        // Handle tool_calls
        if (delta.tool_calls) {
          closeMessage(controller, idx);

          for (const tc of delta.tool_calls) {
            const tcIdx = tc.index ?? 0;
            const newCallId = tc.id;
            const funcName = tc.function?.name;

            // T37: Prevent merging if a new tool_call uses the same index
            if (state.funcCallIds[tcIdx] && newCallId && state.funcCallIds[tcIdx] !== newCallId) {
              closeToolCall(controller, tcIdx);
              delete state.funcCallIds[tcIdx];
              delete state.funcNames[tcIdx];
              delete state.funcArgsBuf[tcIdx];
              delete state.funcArgsDone[tcIdx];
              delete state.funcItemDone[tcIdx];
            }

            if (funcName) state.funcNames[tcIdx] = funcName;

            if (!state.funcCallIds[tcIdx] && newCallId) {
              state.funcCallIds[tcIdx] = newCallId;

              emit(controller, "response.output_item.added", {
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
                emit(controller, "response.function_call_arguments.delta", {
                  type: "response.function_call_arguments.delta",
                  item_id: `fc_${refCallId}`,
                  output_index: tcIdx,
                  delta: tc.function.arguments,
                });
              }
              state.funcArgsBuf[tcIdx] += tc.function.arguments;
            }
          }
        }

        // Handle finish_reason
        if (choice.finish_reason) {
          for (const i in state.msgItemAdded) closeMessage(controller, i);
          closeReasoning(controller);
          for (const i in state.funcCallIds) closeToolCall(controller, i);
          sendCompleted(controller);
        }
      }
    },

    flush(controller) {
      for (const i in state.msgItemAdded) closeMessage(controller, i);
      closeReasoning(controller);
      for (const i in state.funcCallIds) closeToolCall(controller, i);
      sendCompleted(controller);

      logger?.logOutput("data: [DONE]");
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      logger?.flush();
    },
  });
}
