import test from "node:test";
import assert from "node:assert/strict";

const { createStreamDeltaAccumulator, normalizeToolCallKey } =
  await import("../../open-sse/utils/streamDeltaAccumulator.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

test("normalizeToolCallKey prioritizes index then id then sequence", () => {
  assert.equal(normalizeToolCallKey({ index: 2, id: "call_1" }, 7), "idx:2");
  assert.equal(normalizeToolCallKey({ id: "call_1" }, 7), "id:call_1");
  assert.equal(normalizeToolCallKey({}, 7), "seq:7");
});

test("accumulator merges OpenAI content, reasoning alias, tool calls, and usage", () => {
  const acc = createStreamDeltaAccumulator({ format: FORMATS.OPENAI });

  acc.ingest({
    id: "chatcmpl_1",
    model: "gpt-4.1-mini",
    choices: [{ index: 0, delta: { reasoning: "think " } }],
  });
  acc.ingest({
    id: "chatcmpl_1",
    model: "gpt-4.1-mini",
    choices: [{ index: 0, delta: { content: "hel" } }],
    usage: { prompt_tokens: 5, completion_tokens: 0 },
  });
  acc.ingest({
    id: "chatcmpl_1",
    model: "gpt-4.1-mini",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "read_file", arguments: '{"path":"/tmp' },
            },
          ],
        },
      },
    ],
  });
  acc.ingest({
    id: "chatcmpl_1",
    model: "gpt-4.1-mini",
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              function: { arguments: '/a"}' },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 3, total_tokens: 8 },
  });
  acc.ingest({
    id: "chatcmpl_1",
    model: "gpt-4.1-mini",
    choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }],
  });

  const snapshot = acc.getSnapshot();

  assert.equal(snapshot.message.content, "hello");
  assert.equal(snapshot.message.reasoning_content, "think");
  assert.equal(snapshot.message.tool_calls[0].function.name, "read_file");
  assert.equal(snapshot.message.tool_calls[0].function.arguments, '{"path":"/tmp/a"}');
  assert.equal(snapshot.finishReason, "tool_calls");
  assert.deepEqual(snapshot.usage, { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 });
});

test("accumulator reconstructs Claude thinking, text, tool_use, and merged usage", () => {
  const acc = createStreamDeltaAccumulator({ format: FORMATS.CLAUDE });

  acc.ingest({
    type: "message_start",
    message: {
      id: "msg_1",
      model: "claude-sonnet-4",
      role: "assistant",
      usage: { input_tokens: 3 },
    },
  });
  acc.ingest({
    type: "content_block_start",
    index: 0,
    content_block: { type: "thinking", thinking: "step 1", signature: "sig-1" },
  });
  acc.ingest({
    type: "content_block_delta",
    index: 1,
    delta: { text: "Hello" },
  });
  acc.ingest({
    type: "content_block_start",
    index: 2,
    content_block: { type: "tool_use", id: "toolu_1", name: "lookup", input: {} },
  });
  acc.ingest({
    type: "content_block_delta",
    index: 2,
    delta: { type: "input_json_delta", partial_json: '{"q":"docs"}' },
  });
  acc.ingest({
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: "END" },
    usage: { output_tokens: 4 },
  });

  const snapshot = acc.getSnapshot();

  assert.equal(snapshot.message.content[0].type, "thinking");
  assert.equal(snapshot.message.content[0].thinking, "step 1");
  assert.equal(snapshot.message.content[1].type, "text");
  assert.equal(snapshot.message.content[1].text, "Hello");
  assert.equal(snapshot.message.content[2].type, "tool_use");
  assert.deepEqual(snapshot.message.content[2].input, { q: "docs" });
  assert.equal(snapshot.finishReason, "tool_use");
  assert.equal(snapshot.stopSequence, "END");
  assert.deepEqual(snapshot.usage, { input_tokens: 3, output_tokens: 4 });
});
