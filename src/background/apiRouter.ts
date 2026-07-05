import { buildArticlePrecheck } from "./articlePrecheck"
import { createAnalysisPipeline } from "./analysisPipeline"
import { testProviderConnectivity } from "./providerConnectivity"
import { createBigModelClaimProvider, createBigModelEmbeddingProvider } from "../ai/bigmodelProvider"
import { createCustomOpenAiClaimProvider, createCustomOpenAiEmbeddingProvider } from "../ai/customOpenAIProvider"
import { createDeepSeekClaimProvider } from "../ai/deepseekProvider"
import { createOpenAiClaimProvider, createOpenAiEmbeddingProvider } from "../ai/openaiProvider"
import { createChunksRepository } from "../db/chunksRepo"
import { createClaimsRepository } from "../db/claimsRepo"
import { createDocumentsRepository } from "../db/documentsRepo"
import { createEmbeddingsRepository } from "../db/embeddingsRepo"
import { createResultsRepository } from "../db/resultsRepo"
import { createProvidersRepository } from "../db/providersRepo"
import { createSettingsRepository } from "../db/settingsRepo"
import type { CognitiveDeltaDb } from "../db/indexeddb"
import {
  DEFAULT_SETTINGS,
  createEmbeddingId,
  createEmbeddingNamespaceId,
  type ExtractedDocument,
  type ProviderConfig
} from "../shared/types"

function createAnalysisProviders(config: ProviderConfig, apiKey: string) {
  switch (config.type) {
    case "openai":
      return {
        claimProvider: createOpenAiClaimProvider({ apiKey, baseUrl: config.baseUrl }),
        embeddingProvider: createOpenAiEmbeddingProvider({ apiKey, baseUrl: config.baseUrl })
      }
    case "bigmodel":
      return {
        claimProvider: createBigModelClaimProvider({ apiKey, baseUrl: config.baseUrl }),
        embeddingProvider: createBigModelEmbeddingProvider({ apiKey, baseUrl: config.baseUrl })
      }
    case "deepseek":
      return {
        claimProvider: createDeepSeekClaimProvider({ apiKey, baseUrl: config.baseUrl }),
        embeddingProvider: undefined
      }
    case "custom-openai-compatible":
      return {
        claimProvider: createCustomOpenAiClaimProvider({ apiKey, baseUrl: config.baseUrl }),
        embeddingProvider: createCustomOpenAiEmbeddingProvider({ apiKey, baseUrl: config.baseUrl })
      }
  }
}

export function createApiRouter(database: CognitiveDeltaDb) {
  const providersRepository = createProvidersRepository(database)
  const settingsRepository = createSettingsRepository(database)
  const documentsRepository = createDocumentsRepository(database)
  const chunksRepository = createChunksRepository(database)
  const claimsRepository = createClaimsRepository(database)
  const embeddingsRepository = createEmbeddingsRepository(database)
  const resultsRepository = createResultsRepository(database)

  async function listMatchingDocuments(input: {
    readonly canonicalUrl: string
    readonly url: string
  }) {
    return documentsRepository.listByExactUrl(input)
  }

  async function getBestExistingAnalysisResult(input: {
    readonly canonicalUrl: string
    readonly url: string
  }) {
    const matchingDocuments = await listMatchingDocuments(input)

    if (matchingDocuments.length === 0) {
      return null
    }

    const latestResultsByDocumentId = await resultsRepository.getLatestByDocumentIds(
      matchingDocuments.map((document) => document.docId)
    )
    const claims = await claimsRepository.listByDocumentIds(
      matchingDocuments.map((document) => document.docId)
    )
    const claimTextById = new Map(claims.map((claim) => [claim.claimId, claim.text]))
    const candidates = matchingDocuments
      .map((document) => {
        const latestResult = latestResultsByDocumentId.get(document.docId)

        if (latestResult === undefined) {
          return null
        }

        const novelClaims = latestResult.novelClaimIds
          .map((claimId) => claimTextById.get(claimId))
          .filter((claimText): claimText is string => claimText !== undefined)

        return {
          duplicateScore: latestResult.duplicateScore,
          documentExtractor: document.extractor,
          documentReadAt: document.readAt,
          documentSavedAt: document.savedAt,
          judgement: latestResult.judgement,
          novelClaims,
          recommendation: latestResult.recommendation,
          resultCreatedAt: latestResult.createdAt
        }
      })
      .filter((candidate) => candidate !== null)
      .sort((left, right) => {
        const leftIsComplete = left.judgement !== "insufficient-content"
        const rightIsComplete = right.judgement !== "insufficient-content"

        if (leftIsComplete !== rightIsComplete) {
          return Number(rightIsComplete) - Number(leftIsComplete)
        }

        if (right.novelClaims.length !== left.novelClaims.length) {
          return right.novelClaims.length - left.novelClaims.length
        }

        if (right.resultCreatedAt !== left.resultCreatedAt) {
          return right.resultCreatedAt - left.resultCreatedAt
        }

        if (right.documentReadAt !== left.documentReadAt) {
          return right.documentReadAt - left.documentReadAt
        }

        return right.documentSavedAt - left.documentSavedAt
      })

    const selected = candidates[0]

    if (selected === undefined) {
      return null
    }

    return {
      duplicateScore: selected.duplicateScore,
      ...(selected.judgement === undefined
        ? {}
        : {
            judgement: selected.judgement
          }),
      novelClaims: selected.novelClaims,
      recommendation: selected.recommendation,
      sourceExtractor: selected.documentExtractor
    }
  }

  return {
    async analyzeDocument(
      document: ExtractedDocument,
      onAnalysisStageProgress?: (input: {
        readonly stage: "claiming" | "embedding"
        readonly completedTasks: number
        readonly pendingTasks: number
        readonly totalTasks: number
      }) => Promise<void> | void,
      overrides?: {
        readonly claimModel?: string
        readonly claimProviderId?: ProviderConfig["id"]
        readonly embeddingModel?: string
        readonly embeddingProviderId?: ProviderConfig["id"]
      }
    ) {
      const settings = await settingsRepository.getSettings()
      const claimProviderId = overrides?.claimProviderId ?? settings.activeClaimProviderId
      const embeddingProviderId =
        overrides?.embeddingProviderId ?? settings.activeEmbeddingProviderId

      if (claimProviderId === undefined || embeddingProviderId === undefined) {
        throw new Error("Active provider settings are incomplete")
      }

      const claimProviderConfig = await providersRepository.getProviderById(claimProviderId)
      const embeddingProviderConfig = await providersRepository.getProviderById(embeddingProviderId)

      if (claimProviderConfig === undefined || embeddingProviderConfig === undefined) {
        throw new Error("Active provider configuration is missing")
      }

      const claimApiKey = claimProviderConfig.apiKeyEncrypted
      const embeddingApiKey = embeddingProviderConfig.apiKeyEncrypted

      if (claimApiKey === undefined || embeddingApiKey === undefined) {
        throw new Error("Provider API key is missing")
      }

      const claimProviders = createAnalysisProviders(claimProviderConfig, claimApiKey)
      const embeddingProviders = createAnalysisProviders(embeddingProviderConfig, embeddingApiKey)

      if (embeddingProviders.embeddingProvider === undefined) {
        throw new Error("Selected embedding provider does not support embeddings")
      }

      const pipeline = createAnalysisPipeline({
        claimProvider: claimProviders.claimProvider,
        chunksRepository,
        claimsRepository,
        documentsRepository,
        embeddingsRepository,
        embeddingProvider: embeddingProviders.embeddingProvider,
        ...(onAnalysisStageProgress === undefined ? {} : { onAnalysisStageProgress }),
        resultsRepository
      })

      const result = await pipeline.analyzeDocument({
        document,
        claimModel:
          overrides?.claimModel ??
          settings.activeClaimModel ??
          claimProviderConfig.chatModels[0] ??
          "gpt-4.1-mini",
        claimProviderName: claimProviderConfig.type,
        currentDocumentCount: await documentsRepository.countDocuments(),
        embeddingModel:
          overrides?.embeddingModel ??
          settings.activeEmbeddingModel ??
          embeddingProviderConfig.embeddingModels[0] ??
          "text-embedding-3-small",
        embeddingProviderName: embeddingProviderConfig.type,
        maxDocuments: settings.maxDocuments
      })

      await settingsRepository.saveSettings({
        ...settings,
        activeEmbeddingNamespace: result.namespace
      })

      return result
    },

    async checkDocumentUrlHistory(input: {
      readonly canonicalUrl: string
      readonly url: string
    }) {
      const existingDocument = (await listMatchingDocuments(input)).find(
        (document) => document.status === "saved" && document.readAt > 0
      )

      if (
        existingDocument === undefined ||
        existingDocument.status !== "saved" ||
        existingDocument.readAt <= 0
      ) {
        return null
      }

      return {
        duplicateScore: 1,
        kind: "already-read" as const
      }
    },

    async getExistingAnalysisResult(input: {
      readonly canonicalUrl: string
      readonly url: string
    }) {
      return getBestExistingAnalysisResult(input)
    },

    async markDocumentRead(input: {
      readonly canonicalUrl: string
      readonly url: string
    }) {
      const existingDocuments = await listMatchingDocuments(input)

      if (existingDocuments.length === 0) {
        return false
      }

      const readAt = Date.now()

      await Promise.all(
        existingDocuments.map((document) =>
          documentsRepository.saveDocument({
            ...document,
            readAt,
            status: "saved"
          })
        )
      )

      return true
    },

    async precheckDocument(input: {
      readonly canonicalUrl: string
      readonly compactText: string
      readonly url: string
    }) {
      const settings = await settingsRepository.getSettings()
      const embeddingProviderId = settings.activeEmbeddingProviderId

      if (embeddingProviderId === undefined) {
        return {
          duplicateScore: null,
          kind: "unknown-duplicate" as const
        }
      }

      const embeddingProviderConfig = await providersRepository.getProviderById(embeddingProviderId)

      if (
        embeddingProviderConfig === undefined ||
        embeddingProviderConfig.apiKeyEncrypted === undefined
      ) {
        return {
          duplicateScore: null,
          kind: "unknown-duplicate" as const
        }
      }

      const providerBundle = createAnalysisProviders(
        embeddingProviderConfig,
        embeddingProviderConfig.apiKeyEncrypted
      )

      if (providerBundle.embeddingProvider === undefined) {
        return {
          duplicateScore: null,
          kind: "unknown-duplicate" as const
        }
      }

      return buildArticlePrecheck({
        ...(settings.activeEmbeddingNamespace === undefined
          ? {}
          : {
              activeEmbeddingNamespace: settings.activeEmbeddingNamespace
            }),
        documentsRepository,
        embeddingsRepository,
        embeddingModel:
          settings.activeEmbeddingModel ??
          embeddingProviderConfig.embeddingModels[0] ??
          "text-embedding-3-small",
        embeddingProvider: providerBundle.embeddingProvider,
        embeddingProviderName: embeddingProviderConfig.type
      }).run(input)
    },

    async testActiveProviderConnection(providerId: ProviderConfig["id"]) {
      const settings = await settingsRepository.getSettings()
      const providerConfig = await providersRepository.getProviderById(providerId)

      if (providerConfig === undefined) {
        throw new Error("Provider not found")
      }

      if (providerConfig.apiKeyEncrypted === undefined) {
        throw new Error("Provider API key is missing")
      }

      const embeddingModel = settings.activeEmbeddingModel ?? providerConfig.embeddingModels[0]

      return testProviderConnectivity({
        config: providerConfig,
        ...(embeddingModel === undefined ? {} : { embeddingModel }),
        claimModel: settings.activeClaimModel ?? providerConfig.chatModels[0] ?? "gpt-4.1-mini",
        apiKey: providerConfig.apiKeyEncrypted
      })
    },

    async getCurrentSettings() {
      return settingsRepository.getSettings()
    },

    async resetSettings() {
      await settingsRepository.saveSettings(DEFAULT_SETTINGS)
      return DEFAULT_SETTINGS
    },

    async rebuildEmbeddings() {
      const settings = await settingsRepository.getSettings()
      const embeddingProviderId = settings.activeEmbeddingProviderId

      if (embeddingProviderId === undefined) {
        throw new Error("No active embedding provider configured")
      }

      const providerConfig = await providersRepository.getProviderById(embeddingProviderId)

      if (providerConfig === undefined || providerConfig.apiKeyEncrypted === undefined) {
        throw new Error("Embedding provider is not fully configured")
      }

      const providerBundle = createAnalysisProviders(providerConfig, providerConfig.apiKeyEncrypted)

      if (providerBundle.embeddingProvider === undefined) {
        throw new Error("Selected embedding provider does not support embeddings")
      }

      const embeddingModel =
        settings.activeEmbeddingModel ?? providerConfig.embeddingModels[0] ?? "text-embedding-3-small"
      const allClaims = await claimsRepository.listAllClaims()

      if (allClaims.length === 0) {
        return { rebuiltEmbeddings: 0 }
      }

      const fallbackClaim = allClaims[0]

      if (fallbackClaim === undefined) {
        throw new Error("No claims available for embedding rebuild")
      }

      const response = await providerBundle.embeddingProvider.embed({
        texts: allClaims.map((claim) => claim.text),
        model: embeddingModel
      })
      const namespace = createEmbeddingNamespaceId(
        `${providerConfig.type}:${response.model}:${response.dimensions}`
      )

      await embeddingsRepository.deleteByNamespace(namespace)
      await embeddingsRepository.saveEmbeddings(
        response.vectors.map((vector, index) => ({
          embeddingId: createEmbeddingId(`rebuild_${allClaims[index]?.claimId ?? index}_${Date.now()}`),
          targetType: "claim",
          targetId: allClaims[index]?.claimId ?? fallbackClaim.claimId,
          docId: allClaims[index]?.docId ?? fallbackClaim.docId,
          vector,
          provider: providerConfig.type,
          model: response.model,
          dimensions: response.dimensions,
          namespace,
          createdAt: Date.now() + index
        }))
      )

      await settingsRepository.saveSettings({
        ...settings,
        activeEmbeddingNamespace: namespace
      })

      return { rebuiltEmbeddings: allClaims.length }
    }
  }
}
