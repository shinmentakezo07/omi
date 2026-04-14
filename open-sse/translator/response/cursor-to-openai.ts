/**
 * Cursor to OpenAI Response Translator
 * CursorExecutor already emits OpenAI format - this is a passthrough
 */
import { register } from "../registry.ts";
import { FORMATS } from "../formats.ts";
import { normalizeOpenAIFinishReason } from "../helpers/finishReasonHelper.ts";

/**
 * Convert Cursor response to OpenAI format
 * Since CursorExecutor.transformProtobufToSSE/JSON already emits OpenAI chunks,
 * this is a passthrough translator (similar to Kiro pattern)
 */
export function convertCursorToOpenAI(chunk, state) {
  if (!chunk) return null;

  // If chunk is already in OpenAI format (from executor transform), return as-is
  if (chunk.object === "chat.completion.chunk" && chunk.choices) {
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) {
      choice.finish_reason = normalizeOpenAIFinishReason(choice.finish_reason, chunk);
    }
    return chunk;
  }

  // If chunk is a completion object (non-streaming), return as-is
  if (chunk.object === "chat.completion" && chunk.choices) {
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) {
      choice.finish_reason = normalizeOpenAIFinishReason(choice.finish_reason, chunk);
    }
    return chunk;
  }

  // Fallback: return chunk as-is (should not reach here)
  return chunk;
}

register(FORMATS.CURSOR, FORMATS.OPENAI, null, convertCursorToOpenAI);
