import test from "node:test";
import assert from "node:assert/strict";

const { setSystemPromptConfig, getSystemPromptConfig } =
  await import("../../open-sse/services/systemPrompt.ts");
const { restoreRuntimeSettings } = await import("../../src/instrumentation-node.ts");

const originalConsoleLog = console.log;

test.beforeEach(() => {
  console.log = () => {};
  setSystemPromptConfig({ enabled: false, prompt: "" });
});

test.afterEach(() => {
  console.log = originalConsoleLog;
  setSystemPromptConfig({ enabled: false, prompt: "" });
});

test("restoreRuntimeSettings restores persisted global system prompt settings", async () => {
  await restoreRuntimeSettings(async () => ({
    systemPrompt: {
      enabled: true,
      prompt: "Persisted global prompt",
    },
  }));

  assert.deepEqual(getSystemPromptConfig(), {
    enabled: true,
    prompt: "Persisted global prompt",
  });
});

test("restoreRuntimeSettings leaves default config when no persisted system prompt exists", async () => {
  await restoreRuntimeSettings(async () => ({
    modelAliases: null,
    codexServiceTier: null,
  }));

  assert.deepEqual(getSystemPromptConfig(), {
    enabled: false,
    prompt: "",
  });
});
