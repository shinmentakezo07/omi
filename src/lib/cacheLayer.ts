/**
 * LRU Cache Layer — FASE-08 LLM Proxy Advanced
 *
 * In-memory LRU cache for LLM prompt/response pairs.
 * Uses content hashing for cache keys to handle semantic deduplication.
 * Memory-optimized with byte-based limits.
 *
 * @module lib/cacheLayer
 */

import crypto from "crypto";
import { LRUCache as NodeLRUCache } from "lru-cache";
import { env, envNumber } from "@/env";

const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

type CacheValue = unknown;

type CacheEntry = {
  key: string;
  value: CacheValue;
  createdAt: number;
  ttl: number;
  size: number;
  hits: number;
};

type CacheStats = {
  hits: number;
  misses: number;
  evictions: number;
};

export class LRUCache {
  #cache: NodeLRUCache<string, CacheEntry>;
  #maxSize: number;
  #maxBytes: number;
  #defaultTTL: number;
  #stats: CacheStats = { hits: 0, misses: 0, evictions: 0 };

  constructor(options: { maxSize?: number; maxBytes?: number; defaultTTL?: number } = {}) {
    this.#maxSize = options.maxSize ?? DEFAULT_MAX_ENTRIES;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#defaultTTL = options.defaultTTL ?? DEFAULT_TTL;

    this.#cache = new NodeLRUCache<string, CacheEntry>({
      max: this.#maxSize,
      maxSize: this.#maxBytes,
      ttl: this.#defaultTTL,
      sizeCalculation: (entry) => entry.size,
      dispose: (_value, _key, reason) => {
        if (reason === "evict") {
          this.#stats.evictions += 1;
        }
      },
    });
  }

  static generateKey(params: Record<string, unknown>) {
    const normalized = stableStringify(params);
    return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  get(key: string) {
    const entry = this.#cache.get(key);

    if (!entry) {
      this.#stats.misses += 1;
      return undefined;
    }

    entry.hits += 1;
    this.#stats.hits += 1;
    return entry.value;
  }

  set(key: string, value: unknown, ttl?: number) {
    const entrySize = this.#estimateSize(value);
    const entry: CacheEntry = {
      key,
      value,
      createdAt: Date.now(),
      ttl: ttl ?? this.#defaultTTL,
      size: entrySize,
      hits: 0,
    };

    this.#cache.set(key, entry, { ttl: entry.ttl });
  }

  #estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024;
    }
  }

  has(key: string) {
    return this.#cache.has(key);
  }

  delete(key: string) {
    return this.#cache.delete(key);
  }

  clear() {
    this.#cache.clear();
  }

  getStats() {
    const total = this.#stats.hits + this.#stats.misses;
    return {
      size: this.#cache.size,
      maxSize: this.#maxSize,
      bytes: this.#cache.calculatedSize,
      maxBytes: this.#maxBytes,
      ...this.#stats,
      hitRate: total > 0 ? (this.#stats.hits / total) * 100 : 0,
    };
  }
}

let promptCache: LRUCache | null = null;

export function getPromptCache(
  options?: { maxSize?: number; maxBytes?: number; defaultTTL?: number } & Record<string, unknown>
) {
  if (!promptCache) {
    promptCache = new LRUCache({
      maxSize: envNumber(env.PROMPT_CACHE_MAX_SIZE, DEFAULT_MAX_ENTRIES),
      maxBytes: envNumber(env.PROMPT_CACHE_MAX_BYTES, DEFAULT_MAX_BYTES),
      defaultTTL: envNumber(env.PROMPT_CACHE_TTL_MS, DEFAULT_TTL),
      ...options,
    });
  }
  return promptCache;
}

export function clearPromptCache() {
  if (promptCache) {
    promptCache.clear();
  }
}

export function getCacheMetrics() {
  return getPromptCache().getStats();
}
