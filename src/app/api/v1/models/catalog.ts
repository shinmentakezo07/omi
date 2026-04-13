import { CORS_ORIGIN } from "@/shared/utils/cors";
import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import {
  getProviderConnections,
  getCombos,
  getAllCustomModels,
  getSettings,
  getProviderNodes,
  getModelIsHidden,
} from "@/lib/localDb";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { getAllEmbeddingModels } from "@omniroute/open-sse/config/embeddingRegistry.ts";
import { getAllImageModels } from "@omniroute/open-sse/config/imageRegistry.ts";
import { getAllRerankModels } from "@omniroute/open-sse/config/rerankRegistry.ts";
import { getAllAudioModels } from "@omniroute/open-sse/config/audioRegistry.ts";
import { getAllModerationModels } from "@omniroute/open-sse/config/moderationRegistry.ts";
import { getAllVideoModels } from "@omniroute/open-sse/config/videoRegistry.ts";
import { getAllMusicModels } from "@omniroute/open-sse/config/musicRegistry.ts";
import { REGISTRY } from "@omniroute/open-sse/config/providerRegistry.ts";
import { getSyncedAvailableModels } from "@/lib/db/models";
import { getCompatibleFallbackModels } from "@/lib/providers/managedAvailableModels";
import { createCache } from "async-cache-dedupe";

const FALLBACK_ALIAS_TO_PROVIDER = {
  ag: "antigravity",
  cc: "claude",
  cl: "cline",
  cu: "cursor",
  cx: "codex",
  gc: "gemini-cli",
  gh: "github",
  if: "iflow",
  kc: "kilocode",
  kmc: "kimi-coding",
  kr: "kiro",
  qw: "qwen",
};

const VISION_MODEL_KEYWORDS = [
  "gpt-4o",
  "gpt-4.1",
  "gpt-4-vision",
  "gpt-4-turbo",
  "claude-3",
  "claude-3.5",
  "claude-3-5",
  "claude-4",
  "claude-opus",
  "claude-sonnet",
  "claude-haiku",
  "gemini",
  "gemma",
  "llava",
  "bakllava",
  "pixtral",
  "mistral-pixtral",
  "qwen-vl",
  "qvq",
  "glm-4.6v",
  "glm-4.5v",
  "vision",
  "multimodal",
];

const MODELS_RESPONSE_CACHE = createCache({
  ttl: 5,
  storage: { type: "memory" },
});

function isVisionModelId(modelId: string): boolean {
  const normalized = String(modelId || "").toLowerCase();
  if (!normalized) return false;
  return VISION_MODEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function getVisionCapabilityFields(modelId: string) {
  if (!isVisionModelId(modelId)) return null;
  return {
    capabilities: { vision: true },
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  };
}

function buildAliasMaps() {
  const aliasToProviderId: Record<string, string> = {};
  const providerIdToAlias: Record<string, string> = {};

  for (const provider of Object.values(AI_PROVIDERS)) {
    const providerId = provider?.id;
    const alias = provider?.alias || providerId;
    if (!providerId) continue;
    aliasToProviderId[providerId] = providerId;
    aliasToProviderId[alias] = providerId;
    if (!providerIdToAlias[providerId]) {
      providerIdToAlias[providerId] = alias;
    }
  }

  for (const [left, right] of Object.entries(PROVIDER_ID_TO_ALIAS)) {
    if (PROVIDER_MODELS[left]) {
      aliasToProviderId[left] = aliasToProviderId[left] || right;
      continue;
    }
    if (PROVIDER_MODELS[right]) {
      aliasToProviderId[right] = aliasToProviderId[right] || left;
      continue;
    }
    aliasToProviderId[right] = aliasToProviderId[right] || left;
  }

  for (const alias of Object.keys(PROVIDER_MODELS)) {
    if (!aliasToProviderId[alias]) {
      aliasToProviderId[alias] = alias;
    }
  }

  for (const [alias, providerId] of Object.entries(aliasToProviderId)) {
    if (!providerIdToAlias[providerId]) {
      providerIdToAlias[providerId] = alias;
    }
  }

  for (const [alias, providerId] of Object.entries(FALLBACK_ALIAS_TO_PROVIDER)) {
    if (!aliasToProviderId[alias]) aliasToProviderId[alias] = providerId;
    if (!aliasToProviderId[providerId]) aliasToProviderId[providerId] = providerId;
    if (!providerIdToAlias[providerId]) providerIdToAlias[providerId] = alias;
  }

  return { aliasToProviderId, providerIdToAlias };
}

type ModelRecord = Record<string, any>;

type CatalogPayload = {
  settings: Record<string, any>;
  models: ModelRecord[];
};

async function buildCatalogPayload(): Promise<CatalogPayload> {
  let settings: Record<string, any> = {};
  try {
    settings = await getSettings();
  } catch {}

  const { aliasToProviderId, providerIdToAlias } = buildAliasMaps();
  const blockedProviders: Set<string> = new Set(
    Array.isArray(settings.blockedProviders) ? settings.blockedProviders : []
  );

  let connections = [];
  try {
    connections = await getProviderConnections();
    connections = connections.filter((c) => c.isActive !== false);
  } catch (e) {
    console.log("[catalog] Could not fetch providers:", e);
  }

  let providerNodes = [];
  try {
    providerNodes = await getProviderNodes();
  } catch (e) {
    console.log("Could not fetch provider nodes");
  }

  const providerIdToPrefix: Record<string, string> = {};
  const nodeIdToProviderType: Record<string, string> = {};
  for (const node of providerNodes) {
    if (node.prefix) {
      providerIdToPrefix[node.id] = node.prefix;
    }
    if (node.type) {
      nodeIdToProviderType[node.id] = node.type;
    }
  }

  let combos = [];
  try {
    combos = await getCombos();
  } catch (e) {
    console.log("Could not fetch combos");
  }

  const activeAliases = new Set();
  for (const conn of connections) {
    const alias = providerIdToAlias[conn.provider] || conn.provider;
    activeAliases.add(alias);
    activeAliases.add(conn.provider);
  }

  const models: ModelRecord[] = [];
  const timestamp = Math.floor(Date.now() / 1000);

  for (const combo of combos) {
    if (combo.isActive === false || combo.isHidden === true) continue;
    models.push({
      id: combo.name,
      object: "model",
      created: timestamp,
      owned_by: "combo",
      permission: [],
      root: combo.name,
      parent: null,
      ...(combo.context_length ? { context_length: combo.context_length } : {}),
    });
  }

  for (const [alias, providerModels] of Object.entries(PROVIDER_MODELS)) {
    const providerId = aliasToProviderId[alias] || alias;
    const canonicalProviderId = FALLBACK_ALIAS_TO_PROVIDER[alias] || providerId;

    if (blockedProviders.has(alias) || blockedProviders.has(canonicalProviderId)) continue;
    if (!activeAliases.has(alias) && !activeAliases.has(canonicalProviderId)) {
      continue;
    }

    const registryEntry = REGISTRY[alias] || REGISTRY[canonicalProviderId];
    const defaultContextLength = registryEntry?.defaultContextLength;

    for (const model of providerModels) {
      const aliasId = `${alias}/${model.id}`;
      if (getModelIsHidden(canonicalProviderId, model.id)) continue;

      const visionFields =
        getVisionCapabilityFields(aliasId) || getVisionCapabilityFields(model.id);
      const contextLength = model.contextLength || defaultContextLength;

      models.push({
        id: aliasId,
        object: "model",
        created: timestamp,
        owned_by: canonicalProviderId,
        permission: [],
        root: model.id,
        parent: null,
        ...(contextLength ? { context_length: contextLength } : {}),
        ...(visionFields || {}),
      });

      if (canonicalProviderId !== alias) {
        const providerIdModel = `${canonicalProviderId}/${model.id}`;
        const providerVisionFields =
          getVisionCapabilityFields(providerIdModel) || getVisionCapabilityFields(model.id);
        models.push({
          id: providerIdModel,
          object: "model",
          created: timestamp,
          owned_by: canonicalProviderId,
          permission: [],
          root: model.id,
          parent: aliasId,
          ...(contextLength ? { context_length: contextLength } : {}),
          ...(providerVisionFields || {}),
        });
      }
    }
  }

  if (activeAliases.has("gemini") && !blockedProviders.has("gemini")) {
    try {
      const syncedModels = await getSyncedAvailableModels("gemini");
      for (const sm of syncedModels) {
        const aliasId = `gemini/${sm.id}`;
        if (getModelIsHidden("gemini", sm.id)) continue;

        const endpoints = Array.isArray(sm.supportedEndpoints) ? sm.supportedEndpoints : ["chat"];
        let modelType: string | undefined;
        if (endpoints.includes("embeddings")) modelType = "embedding";
        else if (endpoints.includes("images")) modelType = "image";
        else if (endpoints.includes("audio")) modelType = "audio";

        models.push({
          id: aliasId,
          object: "model",
          created: timestamp,
          owned_by: "gemini",
          permission: [],
          root: sm.id,
          parent: null,
          ...(modelType ? { type: modelType } : {}),
          ...(modelType === "audio" ? { subtype: "transcription" } : {}),
          ...(sm.inputTokenLimit ? { context_length: sm.inputTokenLimit } : {}),
          ...(endpoints.length > 1 || !endpoints.includes("chat")
            ? { supported_endpoints: endpoints }
            : {}),
        });

        if (modelType === "audio") {
          models.push({
            id: aliasId,
            object: "model",
            created: timestamp,
            owned_by: "gemini",
            permission: [],
            root: sm.id,
            parent: null,
            type: "audio",
            subtype: "speech",
            ...(sm.inputTokenLimit ? { context_length: sm.inputTokenLimit } : {}),
            ...(endpoints.length > 1 || !endpoints.includes("chat")
              ? { supported_endpoints: endpoints }
              : {}),
          });
        }
      }
    } catch (err) {
      console.error("[catalog] Error fetching synced Gemini models:", err);
    }
  }

  const isProviderActive = (provider: string) => {
    if (activeAliases.size === 0) return false;
    const alias = providerIdToAlias[provider] || provider;
    return activeAliases.has(alias) || activeAliases.has(provider);
  };

  for (const embModel of getAllEmbeddingModels()) {
    if (!isProviderActive(embModel.provider)) continue;
    models.push({
      id: embModel.id,
      object: "model",
      created: timestamp,
      owned_by: embModel.provider,
      type: "embedding",
      dimensions: embModel.dimensions,
    });
  }

  for (const imgModel of getAllImageModels()) {
    if (!isProviderActive(imgModel.provider)) continue;
    models.push({
      id: imgModel.id,
      object: "model",
      created: timestamp,
      owned_by: imgModel.provider,
      type: "image",
      supported_sizes: imgModel.supportedSizes,
    });
  }

  for (const rerankModel of getAllRerankModels()) {
    if (!isProviderActive(rerankModel.provider)) continue;
    models.push({
      id: rerankModel.id,
      object: "model",
      created: timestamp,
      owned_by: rerankModel.provider,
      type: "rerank",
    });
  }

  for (const audioModel of getAllAudioModels()) {
    if (!isProviderActive(audioModel.provider)) continue;
    models.push({
      id: audioModel.id,
      object: "model",
      created: timestamp,
      owned_by: audioModel.provider,
      type: "audio",
      subtype: audioModel.subtype,
    });
  }

  for (const modModel of getAllModerationModels()) {
    if (!isProviderActive(modModel.provider)) continue;
    models.push({
      id: modModel.id,
      object: "model",
      created: timestamp,
      owned_by: modModel.provider,
      type: "moderation",
    });
  }

  for (const videoModel of getAllVideoModels()) {
    if (!isProviderActive(videoModel.provider)) continue;
    models.push({
      id: videoModel.id,
      object: "model",
      created: timestamp,
      owned_by: videoModel.provider,
      type: "video",
    });
  }

  for (const musicModel of getAllMusicModels()) {
    if (!isProviderActive(musicModel.provider)) continue;
    models.push({
      id: musicModel.id,
      object: "model",
      created: timestamp,
      owned_by: musicModel.provider,
      type: "music",
    });
  }

  try {
    const customModelsMap = (await getAllCustomModels()) as Record<string, unknown>;
    for (const [providerId, rawProviderCustomModels] of Object.entries(customModelsMap)) {
      if (providerId === "gemini") continue;
      const providerCustomModels = Array.isArray(rawProviderCustomModels)
        ? rawProviderCustomModels.filter(
            (model): model is Record<string, unknown> =>
              !!model && typeof model === "object" && !Array.isArray(model)
          )
        : [];
      const prefix = providerIdToPrefix[providerId];
      const alias = prefix || providerIdToAlias[providerId] || providerId;
      const canonicalProviderId = FALLBACK_ALIAS_TO_PROVIDER[alias] || providerId;

      const parentProviderType = nodeIdToProviderType[providerId];
      if (
        !activeAliases.has(alias) &&
        !activeAliases.has(canonicalProviderId) &&
        !activeAliases.has(providerId) &&
        !(parentProviderType && activeAliases.has(parentProviderType))
      )
        continue;

      for (const model of providerCustomModels) {
        const modelId = typeof model.id === "string" ? model.id : null;
        if (!modelId) continue;
        if (model.isHidden === true) continue;

        const aliasId = `${alias}/${modelId}`;
        if (models.some((m) => m.id === aliasId)) continue;

        const endpoints = Array.isArray(model.supportedEndpoints)
          ? model.supportedEndpoints
          : ["chat"];
        const apiFormat =
          typeof model.apiFormat === "string" ? model.apiFormat : "chat-completions";
        let modelType: string | undefined;
        if (endpoints.includes("embeddings")) modelType = "embedding";
        else if (endpoints.includes("images")) modelType = "image";
        else if (endpoints.includes("audio")) modelType = "audio";
        const visionFields =
          modelType === "chat"
            ? getVisionCapabilityFields(aliasId) || getVisionCapabilityFields(modelId)
            : null;

        models.push({
          id: aliasId,
          object: "model",
          created: timestamp,
          owned_by: canonicalProviderId,
          permission: [],
          root: modelId,
          parent: null,
          custom: true,
          ...(modelType ? { type: modelType } : {}),
          ...(apiFormat !== "chat-completions" ? { api_format: apiFormat } : {}),
          ...(endpoints.length > 1 || !endpoints.includes("chat")
            ? { supported_endpoints: endpoints }
            : {}),
          ...(typeof (model as any).inputTokenLimit === "number"
            ? { context_length: (model as any).inputTokenLimit }
            : {}),
          ...(visionFields || {}),
        });

        if (canonicalProviderId !== alias && !prefix) {
          const providerPrefixedId = `${canonicalProviderId}/${modelId}`;
          if (models.some((m) => m.id === providerPrefixedId)) continue;
          const providerVisionFields =
            modelType === "chat"
              ? getVisionCapabilityFields(providerPrefixedId) || getVisionCapabilityFields(modelId)
              : null;
          models.push({
            id: providerPrefixedId,
            object: "model",
            created: timestamp,
            owned_by: canonicalProviderId,
            permission: [],
            root: modelId,
            parent: aliasId,
            custom: true,
            ...(modelType ? { type: modelType } : {}),
            ...(typeof (model as any).inputTokenLimit === "number"
              ? { context_length: (model as any).inputTokenLimit }
              : {}),
            ...(providerVisionFields || {}),
          });
        }
      }
    }
  } catch (e) {
    console.log("Could not fetch custom models");
  }

  for (const conn of connections) {
    const providerId = typeof conn.provider === "string" ? conn.provider : null;
    if (!providerId) continue;
    if (blockedProviders.has(providerId)) continue;

    const fallbackModels = getCompatibleFallbackModels(providerId);
    if (!Array.isArray(fallbackModels) || fallbackModels.length === 0) continue;

    const prefix = providerIdToPrefix[providerId];
    const alias = prefix || providerIdToAlias[providerId] || providerId;

    for (const model of fallbackModels) {
      const modelId = typeof model.id === "string" ? model.id : null;
      if (!modelId) continue;
      if (getModelIsHidden(providerId, modelId)) continue;

      const aliasId = `${alias}/${modelId}`;
      if (models.some((m) => m.id === aliasId)) continue;

      const visionFields = getVisionCapabilityFields(aliasId) || getVisionCapabilityFields(modelId);
      const fallbackContextLengthValue = model.contextLength;
      const contextLength =
        typeof fallbackContextLengthValue === "number" ? fallbackContextLengthValue : undefined;

      models.push({
        id: aliasId,
        object: "model",
        created: timestamp,
        owned_by: providerId,
        permission: [],
        root: modelId,
        parent: null,
        ...(contextLength ? { context_length: contextLength } : {}),
        ...(visionFields || {}),
      });
    }
  }

  return { settings, models };
}

MODELS_RESPONSE_CACHE.define("catalogPayload", async () => buildCatalogPayload());

/**
 * Build unified OpenAI-compatible model catalog response.
 * Reused by `/api/v1/models` and `/api/v1` to avoid semantic drift (T09).
 */
export async function getUnifiedModelsResponse(
  request: Request,
  corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
  }
) {
  try {
    const { settings, models } = await MODELS_RESPONSE_CACHE.catalogPayload("shared");

    if (settings.requireAuthForModels === true) {
      if (!(await isAuthenticated(request))) {
        return Response.json(
          {
            error: {
              message: "Authentication required",
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          },
          { status: 401 }
        );
      }
    }

    const authHeader = request.headers.get("authorization");
    let finalModels = models;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const apiKey = authHeader.slice(7);
      const { isModelAllowedForKey } = await import("@/lib/db/apiKeys");

      const filtered = [];
      for (const m of models) {
        if (
          (await isModelAllowedForKey(apiKey, m.id)) ||
          (await isModelAllowedForKey(apiKey, m.root))
        ) {
          filtered.push(m);
        }
      }
      finalModels = filtered;
    }

    return Response.json(
      {
        object: "list",
        data: finalModels,
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json(
      { error: { message: (error as any).message, type: "server_error" } },
      { status: 500 }
    );
  }
}
