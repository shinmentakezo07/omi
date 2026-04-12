import test from "node:test";
import assert from "node:assert/strict";

const { injectSystemPrompt, setSystemPromptConfig, getSystemPromptConfig } =
  await import("../../open-sse/services/systemPrompt.ts");

// ─── Config ─────────────────────────────────────────────────────────────────

test("default config: disabled", () => {
  const config = getSystemPromptConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.prompt, "");
});

// ─── Injection ──────────────────────────────────────────────────────────────

test("injectSystemPrompt: disabled → no change", () => {
  setSystemPromptConfig({ enabled: false, prompt: "system" });
  const body = { messages: [{ role: "user", content: "hi" }] };
  const result = injectSystemPrompt(body);
  assert.deepEqual(result, body);
});

test("injectSystemPrompt: adds system message when none exists", () => {
  setSystemPromptConfig({ enabled: true, prompt: "You are an AI assistant." });
  const body = { messages: [{ role: "user", content: "hi" }] };
  const result = injectSystemPrompt(body);
  assert.equal(result.messages[0].role, "system");
  assert.ok(result.messages[0].content.includes("You are an AI assistant."));
  assert.equal(result.messages.length, 2);
});

test("injectSystemPrompt: prepends to existing system message", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    messages: [
      { role: "system", content: "Original prompt" },
      { role: "user", content: "hi" },
    ],
  };
  const result = injectSystemPrompt(body);
  assert.ok(result.messages[0].content.startsWith("GLOBAL:"));
  assert.ok(result.messages[0].content.includes("Original prompt"));
  assert.equal(result.messages.length, 2);
});

test("injectSystemPrompt: Claude body.system field", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    system: "Claude prompt",
    messages: [{ role: "user", content: "hi" }],
  };
  const result = injectSystemPrompt(body);
  assert.ok(result.system.startsWith("GLOBAL:"));
  assert.ok(result.system.includes("Claude prompt"));
});

test("injectSystemPrompt: Claude array system field", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    system: [{ type: "text", text: "Claude prompt" }],
    messages: [{ role: "user", content: "hi" }],
  };
  const result = injectSystemPrompt(body);
  assert.ok(Array.isArray(result.system));
  assert.equal(result.system[0].text, "GLOBAL:");
  assert.equal(result.system.length, 2);
});

test("injectSystemPrompt: _skipSystemPrompt bypasses", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    _skipSystemPrompt: true,
    messages: [{ role: "user", content: "hi" }],
  };
  const result = injectSystemPrompt(body);
  assert.deepEqual(result, { messages: [{ role: "user", content: "hi" }] });
});

test("injectSystemPrompt: with explicit promptText override", () => {
  setSystemPromptConfig({ enabled: true, prompt: "default" });
  const body = { messages: [{ role: "user", content: "hi" }] };
  const result = injectSystemPrompt(body, "custom override");
  assert.ok(result.messages[0].content.includes("custom override"));
});

test("injectSystemPrompt: null body returns as-is", () => {
  setSystemPromptConfig({ enabled: true, prompt: "test" });
  assert.equal(injectSystemPrompt(null), null);
});

test("injectSystemPrompt: does not mutate the original body", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    messages: [{ role: "user", content: "hi" }],
  };

  const result = injectSystemPrompt(body);

  assert.notEqual(result, body);
  assert.deepEqual(body, {
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(result.messages[0].role, "system");
});

test("injectSystemPrompt: creates instructions for responses input payloads", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    input: [{ role: "user", content: "hi" }],
  };

  const result = injectSystemPrompt(body);

  assert.equal(result.instructions, "GLOBAL:");
  assert.deepEqual(result.input, body.input);
});

test("injectSystemPrompt: prepends to existing responses instructions", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    instructions: "Existing instruction",
    input: [{ role: "user", content: "hi" }],
  };

  const result = injectSystemPrompt(body);

  assert.equal(result.instructions, "GLOBAL:\n\nExisting instruction");
});

test("injectSystemPrompt: does not double inject when system and messages coexist", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    system: "Claude prompt",
    messages: [
      { role: "system", content: "Existing message prompt" },
      { role: "user", content: "hi" },
    ],
  };

  const result = injectSystemPrompt(body);

  assert.equal(result.system, "GLOBAL:\n\nClaude prompt");
  assert.equal(result.messages[0].content, "Existing message prompt");
});

test("injectSystemPrompt: prepends safely to structured system message content", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: "Existing instruction" }],
      },
      { role: "user", content: "hi" },
    ],
  };

  const result = injectSystemPrompt(body);

  assert.ok(Array.isArray(result.messages[0].content));
  assert.deepEqual(result.messages[0].content[0], { type: "text", text: "GLOBAL:" });
  assert.deepEqual(result.messages[0].content[1], { type: "text", text: "Existing instruction" });
});

test("injectSystemPrompt: strips _skipSystemPrompt before returning", () => {
  setSystemPromptConfig({ enabled: true, prompt: "GLOBAL:" });
  const body = {
    _skipSystemPrompt: true,
    messages: [{ role: "user", content: "hi" }],
  };

  const result = injectSystemPrompt(body);

  assert.equal("_skipSystemPrompt" in result, false);
  assert.deepEqual(result.messages, body.messages);
});

// Reset
test.after(() => setSystemPromptConfig({ enabled: false, prompt: "" }));
