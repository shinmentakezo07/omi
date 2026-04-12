import test from "node:test";
import assert from "node:assert/strict";

const { translateNonStreamingResponse } =
  await import("../../open-sse/handlers/responseTranslator.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

test("T19: picks the last non-empty message content from Responses output", () => {
  const responseBody = {
    object: "response",
    id: "resp_t19",
    model: "gpt-5.2-codex",
    created_at: 1710000000,
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "" }],
      },
      {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "thinking..." }],
      },
      {
        type: "message",
        content: [{ type: "output_text", text: "Resposta final" }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  };

  const translated = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );

  assert.equal(translated.choices[0].message.content, "Resposta final");
});



test("T19: preserves structured output_text content metadata for selected message", () => {
  const responseBody = {
    object: "response",
    id: "resp_t19_structured",
    model: "gpt-5.2-codex",
    created_at: 1710000002,
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "Structured text",
            annotations: [{ type: "citation", title: "ref" }],
            logprobs: [{ token: "Structured", logprob: -0.1 }],
          },
        ],
      },
    ],
  };

  const translated = translateNonStreamingResponse(
    responseBody,
    FORMATS.OPENAI_RESPONSES,
    FORMATS.OPENAI
  );

  assert.deepEqual(translated.choices[0].message.content, "Structured text");
});

