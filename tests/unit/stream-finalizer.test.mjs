import test from "node:test";
import assert from "node:assert/strict";

const {
  mergeUsageSnapshot,
  normalizeFinalFinishReason,
  buildOnCompleteResponseBody,
  buildChatCompletionResult,
  buildClaudeMessageResult,
  buildResponsesSummaryFromPayloads,
} = await import("../../open-sse/utils/streamFinalizer.ts");

test("mergeUsageSnapshot does not clobber positive values with zeros", () => {
  assert.deepEqual(
    mergeUsageSnapshot(
      { prompt_tokens: 5, completion_tokens: 0 },
      { prompt_tokens: 0, completion_tokens: 3, total_tokens: 8 }
    ),
    { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
  );
});

test("normalizeFinalFinishReason upgrades stop to tool_calls when tool calls exist", () => {
  assert.equal(normalizeFinalFinishReason("stop", true), "tool_calls");
  assert.equal(normalizeFinalFinishReason("stop", false), "stop");
  assert.equal(normalizeFinalFinishReason(null, false), "stop");
});

test("buildOnCompleteResponseBody preserves OpenAI completion shape", () => {
  const responseBody = buildOnCompleteResponseBody({
    message: {
      role: "assistant",
      content: "Hello",
      reasoning_content: "think",
      tool_calls: [
        {
          id: "call_1",
          index: 0,
          type: "function",
          function: { name: "read_file", arguments: '{"path":"/tmp/a"}' },
        },
      ],
    },
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    finishReason: "stop",
  });

  assert.equal(responseBody.choices[0].finish_reason, "tool_calls");
  assert.equal(responseBody.choices[0].message.content, "Hello");
  assert.equal(responseBody.choices[0].message.reasoning_content, "think");
  assert.equal(responseBody.choices[0].message.tool_calls[0].function.name, "read_file");
  assert.equal(responseBody.usage.total_tokens, 7);
  assert.equal(responseBody._streamed, true);
});

test("buildChatCompletionResult builds deterministic chat completion payloads", () => {
  const result = buildChatCompletionResult({
    id: "chatcmpl_1",
    created: 1,
    model: "gpt-4.1-mini",
    fallbackModel: "fallback-model",
    message: { role: "assistant", content: "Hello" },
    usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    finishReason: "stop",
  });

  assert.equal(result.id, "chatcmpl_1");
  assert.equal(result.object, "chat.completion");
  assert.equal(result.created, 1);
  assert.equal(result.model, "gpt-4.1-mini");
  assert.equal(result.choices[0].message.content, "Hello");
  assert.equal(result.choices[0].finish_reason, "stop");
});

test("buildClaudeMessageResult preserves Claude message shape", () => {
  const result = buildClaudeMessageResult({
    id: "msg_1",
    model: "claude-sonnet-4",
    role: "assistant",
    content: [{ type: "text", text: "Hello" }],
    stopReason: "end_turn",
    stopSequence: "END",
    usage: { input_tokens: 3, output_tokens: 4 },
  });

  assert.equal(result.id, "msg_1");
  assert.equal(result.type, "message");
  assert.equal(result.model, "claude-sonnet-4");
  assert.deepEqual(result.content, [{ type: "text", text: "Hello" }]);
  assert.equal(result.stop_reason, "end_turn");
  assert.equal(result.stop_sequence, "END");
  assert.deepEqual(result.usage, { input_tokens: 3, output_tokens: 4 });
});

test("buildResponsesSummaryFromPayloads prefers completed response payloads", () => {
  const result = buildResponsesSummaryFromPayloads([
    { type: "response.output_text.delta", delta: "Hello " },
    { type: "response.output_text.delta", delta: "world" },
    {
      type: "response.completed",
      response: {
        id: "resp_1",
        object: "response",
        model: "gpt-4.1-mini",
        status: "completed",
        output: [{ type: "message" }],
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      },
    },
  ]);

  assert.equal(result.id, "resp_1");
  assert.equal(result.object, "response");
  assert.equal(result.status, "completed");
  assert.deepEqual(result.usage, { input_tokens: 2, output_tokens: 3, total_tokens: 5 });
});
