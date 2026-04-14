export function hasOpenAIToolCalls(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;

  const record = payload as Record<string, any>;

  if (Array.isArray(record.tool_calls) && record.tool_calls.length > 0) return true;

  if (Array.isArray(record.choices)) {
    return record.choices.some((choice: any) => {
      const deltaCalls = choice?.delta?.tool_calls;
      const messageCalls = choice?.message?.tool_calls;
      return (
        (Array.isArray(deltaCalls) && deltaCalls.length > 0) ||
        (Array.isArray(messageCalls) && messageCalls.length > 0)
      );
    });
  }

  if (Array.isArray(record.output)) {
    return record.output.some((item: any) => item?.type === "function_call");
  }

  return false;
}

export function normalizeOpenAIFinishReason(
  finishReason: string | null | undefined,
  payload: unknown,
  options?: { forceToolCalls?: boolean }
): string | null | undefined {
  let normalized = finishReason ?? null;
  if (normalized === "max_tokens") normalized = "length";
  const hasToolCalls = options?.forceToolCalls === true || hasOpenAIToolCalls(payload);
  if (hasToolCalls && (normalized === "stop" || normalized == null)) {
    return "tool_calls";
  }
  return normalized;
}
