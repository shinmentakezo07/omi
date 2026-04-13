/**
 * System Prompt Injection — Phase 10
 *
 * Injects a global system prompt into all requests at proxy level.
 */

/**
 * @typedef {{ enabled: boolean, prompt: string }} SystemPromptConfig
 */

// In-memory config
/** @type {SystemPromptConfig} */
let _config = {
  enabled: false,
  prompt: "",
};

/**
 * Set system prompt config
 *
 * @param {Partial<SystemPromptConfig>} config
 */
export function setSystemPromptConfig(config) {
  _config = { ..._config, ...config };
}

/**
 * Get system prompt config
 *
 * @returns {SystemPromptConfig}
 */
export function getSystemPromptConfig() {
  return { ..._config };
}

/**
 * Check whether a string value already starts with the given text (exact match).
 * Used to prevent double-injection of the global system prompt.
 *
 * @param {string} value
 * @param {string} text
 * @returns {boolean}
 */
function alreadyStartsWith(value, text) {
  return value === text || value.startsWith(text + "\n");
}

/**
 * @param {string} value
 * @param {string} text
 * @returns {string}
 */
function prependToString(value, text) {
  if (alreadyStartsWith(value, text)) return value;
  return value ? `${text}\n\n${value}` : text;
}

/**
 * Check whether structured content already begins with the given text,
 * indicating a prior injection of the same global prompt.
 *
 * @param {unknown} content
 * @param {string} text
 * @returns {boolean}
 */
function structuredContentAlreadyStartsWith(content, text) {
  if (typeof content === "string") return alreadyStartsWith(content, text);
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0];
    if (first && typeof first === "object" && first.type === "text" && first.text === text) {
      return true;
    }
  }
  return false;
}

/**
 * @param {unknown} content
 * @param {string} text
 * @returns {unknown}
 */
function prependToStructuredContent(content, text) {
  if (structuredContentAlreadyStartsWith(content, text)) return content;

  if (typeof content === "string" || content == null) {
    return prependToString(content || "", text);
  }

  if (Array.isArray(content)) {
    return [{ type: "text", text }, ...content];
  }

  return prependToString(JSON.stringify(content), text);
}

/**
 * @param {Array<{ role?: string, content?: unknown }>} messages
 * @param {string} text
 * @returns {Array<{ role?: string, content?: unknown }>}
 */
function injectIntoMessages(messages, text) {
  const nextMessages = [...messages];
  const systemIndex = nextMessages.findIndex(
    (message) => message?.role === "system" || message?.role === "developer"
  );

  if (systemIndex >= 0) {
    const message = { ...nextMessages[systemIndex] };
    message.content = prependToStructuredContent(message.content, text);
    nextMessages[systemIndex] = message;
    return nextMessages;
  }

  return [{ role: "system", content: text }, ...nextMessages];
}

/**
 * @param {unknown} system
 * @param {string} text
 * @returns {unknown}
 */
function injectIntoSystem(system, text) {
  if (typeof system === "string") {
    return prependToString(system, text);
  }

  if (Array.isArray(system)) {
    if (system.length > 0) {
      const first = system[0];
      if (first && typeof first === "object" && first.type === "text" && first.text === text) {
        return system;
      }
    }
    return [{ type: "text", text }, ...system];
  }

  if (system == null) {
    return text;
  }

  return prependToString(JSON.stringify(system), text);
}

/**
 * Inject system prompt into request body.
 *
 * @param {Record<string, unknown> | null} body - Request body
 * @param {string | null} [promptText] - Override prompt text
 * @returns {Record<string, unknown> | null} Modified body
 */
export function injectSystemPrompt(body, promptText = null) {
  if (!body || typeof body !== "object") return body;

  const result = { ...body };
  if (result._skipSystemPrompt) {
    delete result._skipSystemPrompt;
    return result;
  }

  const text = promptText || _config.prompt;
  if (!text || !_config.enabled) return result;

  if (result.system !== undefined) {
    result.system = injectIntoSystem(result.system, text);
    return result;
  }

  if (typeof result.instructions === "string") {
    if (alreadyStartsWith(result.instructions, text)) return result;
    result.instructions = prependToString(result.instructions, text);
    return result;
  }

  if (Array.isArray(result.messages)) {
    result.messages = injectIntoMessages(result.messages, text);
    return result;
  }

  if (Array.isArray(result.input)) {
    if (result.instructions === text) return result;
    result.instructions = text;
    return result;
  }

  if (result.instructions !== undefined) {
    const instrStr = String(result.instructions || "");
    if (alreadyStartsWith(instrStr, text)) return result;
    result.instructions = prependToString(instrStr, text);
  }

  return result;
}
