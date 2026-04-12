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
 * @param {string} value
 * @param {string} text
 * @returns {string}
 */
function prependToString(value, text) {
  return value ? `${text}\n\n${value}` : text;
}

/**
 * @param {unknown} content
 * @param {string} text
 * @returns {unknown}
 */
function prependToStructuredContent(content, text) {
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
    result.instructions = prependToString(result.instructions, text);
    return result;
  }

  if (Array.isArray(result.messages)) {
    result.messages = injectIntoMessages(result.messages, text);
    return result;
  }

  if (Array.isArray(result.input)) {
    result.instructions = text;
    return result;
  }

  if (result.instructions !== undefined) {
    result.instructions = prependToString(String(result.instructions || ""), text);
  }

  return result;
}
