// Tool call helper functions for translator

const ALPHANUM9 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateToolCallId() {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateToolCallId9(): string {
  let s = "";
  for (let i = 0; i < 9; i++) s += ALPHANUM9[Math.floor(Math.random() * ALPHANUM9.length)];
  return s;
}

export function normalizeToolCallArguments(argumentsValue: unknown): string {
  if (typeof argumentsValue === "string") return argumentsValue;
  if (argumentsValue == null) return "{}";
  try {
    return JSON.stringify(argumentsValue);
  } catch {
    return "{}";
  }
}

export function ensureToolCallIds(body, options?: { use9CharId?: boolean }) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  const use9CharId = options?.use9CharId === true;

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    if (msg.role !== "assistant" || !msg.tool_calls || !Array.isArray(msg.tool_calls)) continue;

    const usedIds = new Set<string>();
    const newIdsInOrder: string[] = [];

    for (const tc of msg.tool_calls) {
      if (!tc.type) tc.type = "function";
      if (!tc.function) tc.function = { name: "", arguments: "{}" };
      tc.function.arguments = normalizeToolCallArguments(tc.function.arguments);

      if (use9CharId) {
        let newId: string;
        do {
          newId = generateToolCallId9();
        } while (usedIds.has(newId));
        usedIds.add(newId);
        tc.id = newId;
        newIdsInOrder.push(newId);
        continue;
      }

      const nextId =
        tc.id != null && String(tc.id).trim() !== "" ? String(tc.id) : generateToolCallId();
      tc.id = nextId;
      newIdsInOrder.push(nextId);
    }

    if (newIdsInOrder.length > 0) {
      let idx = 0;
      for (let j = i + 1; j < body.messages.length; j++) {
        const later = body.messages[j];
        if (later.role === "assistant") break;
        if (later.role !== "tool") continue;
        if (idx < newIdsInOrder.length) {
          later.tool_call_id = newIdsInOrder[idx];
          idx++;
        }
      }
    }
  }

  return body;
}

export function getToolCallIds(msg) {
  if (msg.role !== "assistant") return [];

  const ids = [];
  if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) if (tc.id) ids.push(tc.id);
  }
  if (Array.isArray(msg.content)) {
    for (const block of msg.content) if (block.type === "tool_use" && block.id) ids.push(block.id);
  }
  return ids;
}

export function hasToolResults(msg, toolCallIds) {
  if (!msg || !toolCallIds.length) return false;
  if (msg.role === "tool" && msg.tool_call_id) return toolCallIds.includes(msg.tool_call_id);
  if (msg.role === "user" && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === "tool_result" && toolCallIds.includes(block.tool_use_id)) return true;
    }
  }
  return false;
}

export function fixMissingToolResponses(body, options?: { force?: boolean }) {
  if (!body.messages || !Array.isArray(body.messages)) return body;

  const newMessages = [];
  const forceRepair = options?.force !== false;

  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    const nextMsg = body.messages[i + 1];
    newMessages.push(msg);

    const toolCallIds = getToolCallIds(msg);
    if (toolCallIds.length === 0 || !forceRepair) continue;

    if (nextMsg && !hasToolResults(nextMsg, toolCallIds)) {
      for (const id of toolCallIds) {
        newMessages.push({ role: "tool", tool_call_id: id, content: "" });
      }
    }
  }

  body.messages = newMessages;
  return body;
}
