import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalString = z.string().trim().min(1).optional();
const optionalBooleanString = z.enum(["true", "false"]).optional();
const optionalNumberString = z.string().trim().regex(/^\d+$/).optional();

const serverSchema = {
  APP_LOG_FILE_PATH: optionalString,
  APP_LOG_FORMAT: optionalString,
  APP_LOG_LEVEL: optionalString,
  APP_LOG_MAX_FILES: optionalNumberString,
  APP_LOG_MAX_FILE_SIZE: optionalString,
  APP_LOG_RETENTION_DAYS: optionalNumberString,
  APP_LOG_TO_FILE: optionalBooleanString,
  ALL_PROXY: optionalString,
  API_BRIDGE_PROXY_TIMEOUT_MS: optionalNumberString,
  API_BRIDGE_SERVER_HEADERS_TIMEOUT_MS: optionalNumberString,
  API_BRIDGE_SERVER_KEEPALIVE_TIMEOUT_MS: optionalNumberString,
  API_BRIDGE_SERVER_REQUEST_TIMEOUT_MS: optionalNumberString,
  API_BRIDGE_SERVER_SOCKET_TIMEOUT_MS: optionalNumberString,
  CALL_LOG_MAX_ENTRIES: optionalNumberString,
  CALL_LOG_RETENTION_DAYS: optionalNumberString,
  DATA_DIR: optionalString,
  ENABLE_OTEL: optionalBooleanString,
  ENABLE_REDIS_CACHE: optionalBooleanString,
  ENABLE_SENTRY: optionalBooleanString,
  ENABLE_TLS_FINGERPRINT: optionalBooleanString,
  FETCH_BODY_TIMEOUT_MS: optionalNumberString,
  FETCH_CONNECT_TIMEOUT_MS: optionalNumberString,
  FETCH_HEADERS_TIMEOUT_MS: optionalNumberString,
  FETCH_KEEPALIVE_TIMEOUT_MS: optionalNumberString,
  FETCH_TIMEOUT_MS: optionalNumberString,
  HTTP_PROXY: optionalString,
  HTTPS_PROXY: optionalString,
  LOCAL_HOSTNAMES: optionalString,
  NO_PROXY: optionalString,
  OMNIROUTE_DISABLE_BACKGROUND_SERVICES: optionalBooleanString,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
  PROMETHEUS_PREFIX: optionalString,
  PROMPT_CACHE_MAX_BYTES: optionalNumberString,
  PROMPT_CACHE_MAX_SIZE: optionalNumberString,
  PROMPT_CACHE_TTL_MS: optionalNumberString,
  QODER_OAUTH_AUTHORIZE_URL: optionalString,
  QODER_OAUTH_TOKEN_URL: optionalString,
  RATE_LIMIT_MAX_WAIT_MS: optionalNumberString,
  REDIS_URL: optionalString,
  REQUEST_TIMEOUT_MS: optionalNumberString,
  SEMANTIC_CACHE_MAX_BYTES: optionalNumberString,
  SEMANTIC_CACHE_MAX_SIZE: optionalNumberString,
  SEMANTIC_CACHE_TTL_MS: optionalNumberString,
  SENTRY_AUTH_TOKEN: optionalString,
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString,
  STORAGE_ENCRYPTION_KEY: optionalString,
  STREAM_IDLE_TIMEOUT_MS: optionalNumberString,
  TLS_CLIENT_TIMEOUT_MS: optionalNumberString,
  USAGE_TOKEN_BUFFER: optionalNumberString,
  XDG_CONFIG_HOME: optionalString,
};

type ServerEnv = {
  [K in keyof typeof serverSchema]: string | undefined;
};

function readRuntimeEnv(): ServerEnv {
  return {
    APP_LOG_FILE_PATH: process.env.APP_LOG_FILE_PATH,
    APP_LOG_FORMAT: process.env.APP_LOG_FORMAT,
    APP_LOG_LEVEL: process.env.APP_LOG_LEVEL,
    APP_LOG_MAX_FILES: process.env.APP_LOG_MAX_FILES,
    APP_LOG_MAX_FILE_SIZE: process.env.APP_LOG_MAX_FILE_SIZE,
    APP_LOG_RETENTION_DAYS: process.env.APP_LOG_RETENTION_DAYS,
    APP_LOG_TO_FILE: process.env.APP_LOG_TO_FILE,
    ALL_PROXY: process.env.ALL_PROXY,
    API_BRIDGE_PROXY_TIMEOUT_MS: process.env.API_BRIDGE_PROXY_TIMEOUT_MS,
    API_BRIDGE_SERVER_HEADERS_TIMEOUT_MS: process.env.API_BRIDGE_SERVER_HEADERS_TIMEOUT_MS,
    API_BRIDGE_SERVER_KEEPALIVE_TIMEOUT_MS: process.env.API_BRIDGE_SERVER_KEEPALIVE_TIMEOUT_MS,
    API_BRIDGE_SERVER_REQUEST_TIMEOUT_MS: process.env.API_BRIDGE_SERVER_REQUEST_TIMEOUT_MS,
    API_BRIDGE_SERVER_SOCKET_TIMEOUT_MS: process.env.API_BRIDGE_SERVER_SOCKET_TIMEOUT_MS,
    CALL_LOG_MAX_ENTRIES: process.env.CALL_LOG_MAX_ENTRIES,
    CALL_LOG_RETENTION_DAYS: process.env.CALL_LOG_RETENTION_DAYS,
    DATA_DIR: process.env.DATA_DIR,
    ENABLE_OTEL: process.env.ENABLE_OTEL,
    ENABLE_REDIS_CACHE: process.env.ENABLE_REDIS_CACHE,
    ENABLE_SENTRY: process.env.ENABLE_SENTRY,
    ENABLE_TLS_FINGERPRINT: process.env.ENABLE_TLS_FINGERPRINT,
    FETCH_BODY_TIMEOUT_MS: process.env.FETCH_BODY_TIMEOUT_MS,
    FETCH_CONNECT_TIMEOUT_MS: process.env.FETCH_CONNECT_TIMEOUT_MS,
    FETCH_HEADERS_TIMEOUT_MS: process.env.FETCH_HEADERS_TIMEOUT_MS,
    FETCH_KEEPALIVE_TIMEOUT_MS: process.env.FETCH_KEEPALIVE_TIMEOUT_MS,
    FETCH_TIMEOUT_MS: process.env.FETCH_TIMEOUT_MS,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    LOCAL_HOSTNAMES: process.env.LOCAL_HOSTNAMES,
    NO_PROXY: process.env.NO_PROXY,
    OMNIROUTE_DISABLE_BACKGROUND_SERVICES: process.env.OMNIROUTE_DISABLE_BACKGROUND_SERVICES,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    PROMETHEUS_PREFIX: process.env.PROMETHEUS_PREFIX,
    PROMPT_CACHE_MAX_BYTES: process.env.PROMPT_CACHE_MAX_BYTES,
    PROMPT_CACHE_MAX_SIZE: process.env.PROMPT_CACHE_MAX_SIZE,
    PROMPT_CACHE_TTL_MS: process.env.PROMPT_CACHE_TTL_MS,
    QODER_OAUTH_AUTHORIZE_URL: process.env.QODER_OAUTH_AUTHORIZE_URL,
    QODER_OAUTH_TOKEN_URL: process.env.QODER_OAUTH_TOKEN_URL,
    RATE_LIMIT_MAX_WAIT_MS: process.env.RATE_LIMIT_MAX_WAIT_MS,
    REDIS_URL: process.env.REDIS_URL,
    REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS,
    SEMANTIC_CACHE_MAX_BYTES: process.env.SEMANTIC_CACHE_MAX_BYTES,
    SEMANTIC_CACHE_MAX_SIZE: process.env.SEMANTIC_CACHE_MAX_SIZE,
    SEMANTIC_CACHE_TTL_MS: process.env.SEMANTIC_CACHE_TTL_MS,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    STORAGE_ENCRYPTION_KEY: process.env.STORAGE_ENCRYPTION_KEY,
    STREAM_IDLE_TIMEOUT_MS: process.env.STREAM_IDLE_TIMEOUT_MS,
    TLS_CLIENT_TIMEOUT_MS: process.env.TLS_CLIENT_TIMEOUT_MS,
    USAGE_TOKEN_BUFFER: process.env.USAGE_TOKEN_BUFFER,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  };
}

function getValidatedEnv(): ServerEnv {
  return createEnv({
    server: serverSchema,
    client: {},
    runtimeEnv: readRuntimeEnv(),
    emptyStringAsUndefined: true,
  }) as ServerEnv;
}

export const env = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    return getValidatedEnv()[prop as keyof ServerEnv];
  },
  ownKeys() {
    return Reflect.ownKeys(readRuntimeEnv());
  },
  getOwnPropertyDescriptor() {
    return {
      enumerable: true,
      configurable: true,
    };
  },
}) as ServerEnv;

export function envFlag(value: string | undefined): boolean {
  return value === "true";
}

export function envNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
