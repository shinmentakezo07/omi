/**
 * Semantic Cache — Phase 9.1
 *
 * Caches non-streaming LLM responses (temperature=0) to reduce cost and latency.
 * Two-tier: in-memory LRU (fast) + SQLite (persistent across restarts).
 *
 * Cache key = SHA-256(model + normalized messages + temperature + top_p)
 * Bypass: X-OmniRoute-No-Cache: true
 *
 * @module lib/semanticCache
 */

import crypto from "crypto";
import { LRUCache } from "./cacheLayer";
import { getDbInstance } from "./db/core";
import { env, envNumber } from "@/env";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SEMANTIC_CACHE_TTL_MS = 1800000;
const DEFAULT_SEMANTIC_CACHE_MAX_SIZE = 100;
const DEFAULT_SEMANTIC_CACHE_MAX_BYTES = 4 * 1024 * 1024;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function ensureCacheMetricsTable() {
  try {
    const db = getDbInstance();
    db.prepare(
      `CREATE TABLE IF NOT EXISTS cache_metrics (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO cache_metrics (key, value) VALUES ('hits', 0), ('misses', 0), ('tokens_saved', 0)`
    ).run();
  } catch {
    // DB not available
  }
}

function incrementMetric(metric: "hits" | "misses" | "tokens_saved", amount = 1) {
  try {
    const db = getDbInstance();
    db.prepare(
      `UPDATE cache_metrics SET value = value + ?, updated_at = datetime('now') WHERE key = ?`
    ).run(amount, metric);
  } catch {
    // DB not available — fall back to in-memory
  }
}

function getMetricValue(metric: string): number {
  try {
    const db = getDbInstance();
    const row = db.prepare(`SELECT value FROM cache_metrics WHERE key = ?`).get(metric);
    return row ? toNumber(asRecord(row).value, 0) : 0;
  } catch {
    return 0;
  }
}

function getHeaderValue(
  headers: { get?: (name: string) => string | null } | Record<string, unknown> | null | undefined,
  name: string
): string | null {
  if (!headers) return null;

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== needle) continue;
    return typeof value === "string" ? value : null;
  }

  return null;
}

// ─── Singleton ─────────────────

let memoryCache: LRUCache | null = null;

function getSemanticCacheTTL() {
  return envNumber(env.SEMANTIC_CACHE_TTL_MS, DEFAULT_SEMANTIC_CACHE_TTL_MS);
}

function getMemoryCache() {
  if (!memoryCache) {
    memoryCache = new LRUCache({
      maxSize: envNumber(env.SEMANTIC_CACHE_MAX_SIZE, DEFAULT_SEMANTIC_CACHE_MAX_SIZE),
      maxBytes: envNumber(env.SEMANTIC_CACHE_MAX_BYTES, DEFAULT_SEMANTIC_CACHE_MAX_BYTES),
      defaultTTL: getSemanticCacheTTL(),
    });
    ensureCacheMetricsTable();
  }
  return memoryCache;
}

// ─── Signature Generation ─────────────────

/**
 * Generate deterministic cache signature from request params.
 * @param {string} model
 * @param {Array} messages - Normalized messages array
 * @param {number} temperature
 * @param {number} topP
 * @returns {string} hex signature
 */
export function generateSignature(model, messages, temperature = 0, topP = 1) {
  const payload = JSON.stringify({
    model,
    messages: normalizeMessages(messages),
    temperature,
    top_p: topP,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Normalize messages for consistent hashing.
 * Strips metadata, keeps only role + content.
 */
function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({
    role: m.role || "user",
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

// ─── Cache Operations ─────────────────

/**
 * Check if a cached response exists for the given signature.
 * Checks memory first, then SQLite.
 * @param {string} signature
 * @returns {object|null} Cached response or null
 */
export function getCachedResponse(signature) {
  // 1. Check memory cache
  const memResult = getMemoryCache().get(signature);
  if (memResult) {
    incrementMetric("hits");
    incrementMetric("tokens_saved", memResult.tokensSaved || 0);
    return memResult.response;
  }

  // 2. Check SQLite
  try {
    const db = getDbInstance();
    const row = db
      .prepare(
        "SELECT response, tokens_saved FROM semantic_cache WHERE signature = ? AND expires_at > datetime('now')"
      )
      .get(signature);

    if (row) {
      const record = asRecord(row);
      const responsePayload = typeof record.response === "string" ? record.response : null;
      if (!responsePayload) {
        incrementMetric("misses");
        return null;
      }
      const parsed = JSON.parse(responsePayload);
      const tokensSaved = toNumber(record.tokens_saved, 0);
      // Promote to memory cache
      getMemoryCache().set(signature, {
        response: parsed,
        tokensSaved,
      });
      // Update hit count in DB
      db.prepare("UPDATE semantic_cache SET hit_count = hit_count + 1 WHERE signature = ?").run(
        signature
      );

      incrementMetric("hits");
      incrementMetric("tokens_saved", tokensSaved);
      return parsed;
    }
  } catch {
    // DB not available — fail open
  }

  incrementMetric("misses");
  return null;
}

/**
 * Store a response in cache.
 * @param {string} signature
 * @param {string} model
 * @param {object} response - The API response to cache
 * @param {number} tokensSaved - Estimated tokens saved
 * @param {number} [ttlMs] - TTL in ms (default: env or 30 minutes)
 */
export function setCachedResponse(
  signature,
  model,
  response,
  tokensSaved = 0,
  ttlMs = getSemanticCacheTTL()
) {
  const ttl = ttlMs;

  // 1. Memory cache
  getMemoryCache().set(signature, { response, tokensSaved }, ttl);

  // 2. SQLite
  try {
    const db = getDbInstance();
    const id = crypto.randomUUID();
    const promptHash = signature.slice(0, 16);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttl).toISOString();

    db.prepare(
      `INSERT OR REPLACE INTO semantic_cache (id, signature, model, prompt_hash, response, tokens_saved, hit_count, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(id, signature, model, promptHash, JSON.stringify(response), tokensSaved, now, expiresAt);
  } catch {
    // DB write failed — cache still in memory
  }
}

// ─── Maintenance ─────────────────

/**
 * Remove expired entries from SQLite.
 * @returns {number} Number of entries removed
 */
export function cleanExpiredEntries() {
  try {
    const db = getDbInstance();
    const result = db
      .prepare("DELETE FROM semantic_cache WHERE expires_at <= datetime('now')")
      .run();
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Invalidate cache entries by model name.
 * Useful when a model is updated/changed and cached responses are stale.
 * @param {string} model - Model name to invalidate (exact match)
 * @returns {number} Number of entries removed
 */
export function invalidateByModel(model: string): number {
  getMemoryCache().clear(); // Memory cache doesn't track model; full clear
  try {
    const db = getDbInstance();
    const result = db.prepare("DELETE FROM semantic_cache WHERE model = ?").run(model);
    return result.changes || 0;
  } catch {
    return 0;
  }
}

/**
 * Invalidate a single cache entry by its signature.
 * @param {string} signature - Cache signature to invalidate
 * @returns {boolean} Whether the entry was found and removed
 */
export function invalidateBySignature(signature: string): boolean {
  getMemoryCache().delete(signature);
  try {
    const db = getDbInstance();
    const result = db.prepare("DELETE FROM semantic_cache WHERE signature = ?").run(signature);
    return (result.changes || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Invalidate all entries from both memory and SQLite caches.
 * @returns {number} Number of SQLite entries removed
 */
export function clearSemanticCache(): number {
  getMemoryCache().clear();
  try {
    const db = getDbInstance();
    const result = db.prepare("DELETE FROM semantic_cache").run();
    return result.changes || 0;
  } catch {
    return 0;
  }
}

/**
 * Get cache statistics.
 * @returns {object}
 */
export function getCacheStats() {
  const memStats = getMemoryCache().getStats();
  const hits = getMetricValue("hits");
  const misses = getMetricValue("misses");
  const tokensSaved = getMetricValue("tokens_saved");
  const total = hits + misses;

  return {
    memory: memStats,
    persistent: {
      hits,
      misses,
      tokensSaved,
      hitRate: total > 0 ? (hits / total) * 100 : 0,
    },
  };
}

/**
 * Middleware hook for requests.
 * If cache hit, returns Response immediately.
 * If cache miss, returns null.
 */
export function tryServeFromCache(request, body) {
  // Only cache non-streaming, temp=0 requests
  if (body.stream === true) return null;
  if ((body.temperature || 0) > 0) return null;

  // Bypass header
  const noCache = getHeaderValue(request?.headers, "x-omniroute-no-cache");
  if (noCache === "true") return null;

  const signature = generateSignature(body.model, body.messages, body.temperature, body.top_p);
  const cached = getCachedResponse(signature);
  if (!cached) return null;

  return {
    signature,
    response: cached,
  };
}

/**
 * Middleware hook for responses.
 * Stores successful response in cache if eligible.
 */
export function maybeCacheResponse(request, body, responseData) {
  // Only cache non-streaming, temp=0 successful responses
  if (body.stream === true) return;
  if ((body.temperature || 0) > 0) return;
  if (!responseData || responseData.error) return;

  // Bypass header
  const noCache = getHeaderValue(request?.headers, "x-omniroute-no-cache");
  if (noCache === "true") return;

  const signature = generateSignature(body.model, body.messages, body.temperature, body.top_p);

  // Estimate tokens saved = prompt_tokens from usage (or 0 if unavailable)
  const usage = asRecord(responseData.usage);
  const tokensSaved = toNumber(usage.prompt_tokens, 0);

  setCachedResponse(signature, body.model, responseData, tokensSaved);
}

// ─── Initialization ─────────────────

// Background cleanup every 5 minutes
let cleanupInterval;
if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
  cleanupInterval = setInterval(
    () => {
      const removed = cleanExpiredEntries();
      if (removed > 0) {
        console.log(`[semanticCache] Cleaned ${removed} expired entries`);
      }
    },
    5 * 60 * 1000
  );

  // Prevent timer from keeping Node.js alive (tests, CLI scripts)
  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }
}

// Export for testing
export function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
  }
}

export function invalidateStale(maxAgeMs: number): number {
  getMemoryCache().clear();
  try {
    const db = getDbInstance();
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = db.prepare("DELETE FROM semantic_cache WHERE created_at < ?").run(cutoff);
    return result.changes || 0;
  } catch {
    return 0;
  }
}

export function clearCache() {
  getMemoryCache().clear();
  try {
    const db = getDbInstance();
    db.prepare("DELETE FROM semantic_cache").run();
    db.prepare("UPDATE cache_metrics SET value = 0").run();
  } catch {
    // DB not available
  }
}

export function isCacheable(body, headers) {
  if ((getHeaderValue(headers, "x-omniroute-no-cache") || "").toLowerCase() === "true") {
    return false;
  }
  if (body.stream !== false) return false;
  if ((body.temperature ?? 0) !== 0) return false;
  return true;
}
