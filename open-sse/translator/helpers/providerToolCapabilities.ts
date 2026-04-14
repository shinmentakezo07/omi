const SHORT_TOOL_ID_PROVIDERS = new Set(["mistral"]);

export function getProviderToolCapabilities(provider?: string | null, model?: string | null) {
  const providerId = typeof provider === "string" ? provider : "";
  const modelId = typeof model === "string" ? model : "";
  const requiresReasoningContent = providerId === "deepseek" || /r1|reason/i.test(modelId);

  return {
    requiresShortToolCallIds: SHORT_TOOL_ID_PROVIDERS.has(providerId),
    requiresImmediateToolResults:
      providerId === "claude" || providerId.startsWith("anthropic-compatible-"),
    rejectsEmptyTextBlocks:
      providerId === "claude" || providerId.startsWith("anthropic-compatible-"),
    requiresReasoningContentForToolCalls: requiresReasoningContent,
    supportsParallelToolCalls: providerId !== "claude",
    normalizeToolCallFinishReason: true,
  };
}
