import "fake-indexeddb/auto"

import { afterEach, describe, expect, it } from "vitest"

import { createAnalysisJobsRepository } from "../../src/background/analysisJobsRepo"
import { createChunksRepository } from "../../src/db/chunksRepo"
import { createClaimsRepository } from "../../src/db/claimsRepo"
import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createDocumentsRepository } from "../../src/db/documentsRepo"
import { createEmbeddingsRepository } from "../../src/db/embeddingsRepo"
import { clearArticleLibrary, exportLocalKnowledge, resetLocalKnowledge } from "../../src/db/exportImport"
import { createFeedbackRepository } from "../../src/db/feedbackRepo"
import { createProvidersRepository } from "../../src/db/providersRepo"
import { createResultsRepository } from "../../src/db/resultsRepo"
import { createSettingsRepository } from "../../src/db/settingsRepo"
import { createWhitelistRepository } from "../../src/db/whitelistRepo"
import {
  createAnalysisJobId,
  createChunkId,
  createClaimId,
  createDocumentId,
  createEmbeddingId,
  createEmbeddingNamespaceId,
  createFeedbackId,
  createProviderId,
  createResultId
} from "../../src/shared/types"

function createTestDb() {
  return createCognitiveDeltaDb(`test-${crypto.randomUUID()}`)
}

afterEach(async () => {
  indexedDB.databases?.().then(async (databases) => {
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => name !== undefined)
        .map(async (name) => {
          indexedDB.deleteDatabase(name)
        })
    )
  })
})

describe("indexeddb repositories", () => {
  it("finds a document by canonicalUrl and raw url", async () => {
    const database = createTestDb()
    const documentsRepository = createDocumentsRepository(database)

    await documentsRepository.saveDocument({
      docId: createDocumentId("doc_existing"),
      url: "https://example.com/article?from=weibo",
      canonicalUrl: "https://example.com/article",
      domain: "example.com",
      title: "Existing article",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_existing",
      extractor: "generic-article",
      status: "saved"
    })

    await expect(
      documentsRepository.findByExactUrl({
        canonicalUrl: "https://example.com/article",
        url: "https://example.com/article?from=weibo"
      })
    ).resolves.toMatchObject({ docId: createDocumentId("doc_existing") })
    await database.delete()
  })

  it("finds a weibo document across www and non-www host variants", async () => {
    const database = createTestDb()
    const documentsRepository = createDocumentsRepository(database)

    await documentsRepository.saveDocument({
      docId: createDocumentId("doc_weibo_www"),
      url: "https://www.weibo.com/1657210044/R6PwixIhq",
      canonicalUrl: "https://www.weibo.com/1657210044/R6PwixIhq",
      domain: "www.weibo.com",
      title: "Existing weibo article",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_weibo_www",
      extractor: "feed-item",
      status: "saved"
    })

    await expect(
      documentsRepository.findByExactUrl({
        canonicalUrl: "https://weibo.com/1657210044/R6PwixIhq",
        url: "https://weibo.com/1657210044/R6PwixIhq"
      })
    ).resolves.toMatchObject({ docId: createDocumentId("doc_weibo_www") })
    await database.delete()
  })

  it("stores and lists executable analysis jobs in FIFO order", async () => {
    const database = createTestDb()
    const jobsRepository = createAnalysisJobsRepository(database)

    await jobsRepository.enqueueJob(makeAnalysisJobFixture("job_1", 1))
    await jobsRepository.enqueueJob(makeAnalysisJobFixture("job_2", 2))

    await expect(jobsRepository.listPendingJobs()).resolves.toMatchObject([
      { jobId: createAnalysisJobId("job_1") },
      { jobId: createAnalysisJobId("job_2") }
    ])
    await database.delete()
  })

  it("finds an executable social analysis job across www and non-www host variants", async () => {
    const database = createTestDb()
    const jobsRepository = createAnalysisJobsRepository(database)

    await jobsRepository.enqueueJob({
      ...makeAnalysisJobFixture("job_weibo_www", 1),
      url: "https://www.weibo.com/1657210044/R6PwixIhq",
      canonicalUrl: "https://www.weibo.com/1657210044/R6PwixIhq"
    })

    await expect(
      jobsRepository.findExecutableJobByExactUrl({
        canonicalUrl: "https://weibo.com/1657210044/R6PwixIhq",
        url: "https://weibo.com/1657210044/R6PwixIhq"
      })
    ).resolves.toMatchObject({ jobId: createAnalysisJobId("job_weibo_www") })
    await database.delete()
  })

  it("bootstraps default settings", async () => {
    const database = createTestDb()
    const settingsRepository = createSettingsRepository(database)

    const settings = await settingsRepository.getSettings()

    expect(settings.singleArticleReadMode).toBe("auto")
    expect(settings.feedItemReadMode).toBe("manual")
    expect(settings.themeMode).toBe("auto")
    expect(settings.languageMode).toBe("auto")
    expect(settings.novelClaimsOverlaySeconds).toBe(5)
    expect(settings.novelClaimsOverlaySecondsCustomized).toBe(false)
    expect(settings.novelClaimsOverlayMaxVisible).toBe(5)
    expect(settings.maxDocuments).toBe(1000)
    await database.delete()
  })

  it("migrates the legacy 20-second overlay default to 5 seconds", async () => {
    const database = createTestDb()
    const settingsRepository = createSettingsRepository(database)

    await database.settings.put({
      ...(await settingsRepository.getSettings()),
      novelClaimsOverlaySeconds: 20,
      novelClaimsOverlaySecondsCustomized: false
    })

    const settings = await settingsRepository.getSettings()

    expect(settings.novelClaimsOverlaySeconds).toBe(5)
    expect(settings.novelClaimsOverlaySecondsCustomized).toBe(false)
    await database.delete()
  })

  it("preserves an explicit 20-second overlay duration chosen by the user", async () => {
    const database = createTestDb()
    const settingsRepository = createSettingsRepository(database)

    await database.settings.put({
      ...(await settingsRepository.getSettings()),
      novelClaimsOverlaySeconds: 20,
      novelClaimsOverlaySecondsCustomized: true
    })

    const settings = await settingsRepository.getSettings()

    expect(settings.novelClaimsOverlaySeconds).toBe(20)
    expect(settings.novelClaimsOverlaySecondsCustomized).toBe(true)
    await database.delete()
  })

  it("supports whitelist CRUD", async () => {
    const database = createTestDb()
    const whitelistRepository = createWhitelistRepository(database)

    await whitelistRepository.addDomain("example.com")
    await whitelistRepository.addDomain("mp.weixin.qq.com")

    expect(await whitelistRepository.listDomains()).toEqual(["example.com", "mp.weixin.qq.com"])

    await whitelistRepository.removeDomain("example.com")

    expect(await whitelistRepository.listDomains()).toEqual(["mp.weixin.qq.com"])
    await database.delete()
  })

  it("lists providers ordered by createdAt", async () => {
    const database = createTestDb()
    const providersRepository = createProvidersRepository(database)

    await providersRepository.saveProvider({
      id: createProviderId("provider_1"),
      name: "Older",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      embeddingModels: ["text-embedding-3-small"],
      chatModels: ["gpt-4.1-mini"],
      supportsEmbedding: true,
      supportsChat: true,
      createdAt: 1,
      updatedAt: 1
    })
    await providersRepository.saveProvider({
      id: createProviderId("provider_2"),
      name: "Newer",
      type: "bigmodel",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      embeddingModels: ["embedding-3"],
      chatModels: ["glm-5"],
      supportsEmbedding: true,
      supportsChat: true,
      createdAt: 2,
      updatedAt: 2
    })

    await expect(providersRepository.listProviders()).resolves.toMatchObject([
      { name: "Older" },
      { name: "Newer" }
    ])
    await database.delete()
  })

  it("filters embeddings by namespace", async () => {
    const database = createTestDb()
    const embeddingsRepository = createEmbeddingsRepository(database)

    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_1"),
        targetType: "claim",
        targetId: createClaimId("claim_1"),
        docId: createDocumentId("doc_1"),
        vector: [1, 0],
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        createdAt: 1
      },
      {
        embeddingId: createEmbeddingId("embedding_2"),
        targetType: "claim",
        targetId: createClaimId("claim_2"),
        docId: createDocumentId("doc_2"),
        vector: [0, 1],
        provider: "openai",
        model: "text-embedding-3-large",
        dimensions: 3072,
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-large:3072"),
        createdAt: 2
      }
    ])

    const namespaceRecords = await embeddingsRepository.listByNamespace(
      createEmbeddingNamespaceId("openai:text-embedding-3-small:1536")
    )

    expect(namespaceRecords).toHaveLength(1)
    expect(namespaceRecords[0]?.embeddingId).toBe(createEmbeddingId("embedding_1"))
    await database.delete()
  })

  it("exports and clears local knowledge data", async () => {
    const database = createTestDb()
    const settingsRepository = createSettingsRepository(database)
    const documentsRepository = createDocumentsRepository(database)
    const chunksRepository = createChunksRepository(database)
    const claimsRepository = createClaimsRepository(database)
    const embeddingsRepository = createEmbeddingsRepository(database)
    const resultsRepository = createResultsRepository(database)
    const feedbackRepository = createFeedbackRepository(database)
    const providersRepository = createProvidersRepository(database)

    await settingsRepository.getSettings()
    await providersRepository.saveProvider({
      id: createProviderId("provider_1"),
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      embeddingModels: ["text-embedding-3-small"],
      chatModels: ["gpt-4.1-mini"],
      supportsEmbedding: true,
      supportsChat: true,
      createdAt: 1,
      updatedAt: 1
    })
    await documentsRepository.saveDocument({
      docId: createDocumentId("doc_1"),
      url: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      domain: "example.com",
      title: "Example",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_1",
      extractor: "generic",
      status: "saved"
    })
    await chunksRepository.saveChunks([
      {
        chunkId: createChunkId("chunk_1"),
        docId: createDocumentId("doc_1"),
        text: "chunk text",
        startOffset: 0,
        endOffset: 10,
        charCount: 10,
        createdAt: 1
      }
    ])
    await claimsRepository.saveClaims([
      {
        claimId: createClaimId("claim_1"),
        docId: createDocumentId("doc_1"),
        chunkId: createChunkId("chunk_1"),
        text: "claim text",
        type: "fact",
        importance: 0.9,
        confidence: 0.8,
        entities: ["Example"],
        provider: "openai",
        model: "gpt-4.1-mini",
        createdAt: 1
      }
    ])
    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_1"),
        targetType: "claim",
        targetId: createClaimId("claim_1"),
        docId: createDocumentId("doc_1"),
        vector: [1, 0],
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        createdAt: 1
      }
    ])
    await resultsRepository.saveResult({
      resultId: createResultId("result_1"),
      docId: createDocumentId("doc_1"),
      duplicateScore: 0.5,
      noveltyScore: 0.5,
      recommendation: "skim",
      matchedClaimIds: [createClaimId("claim_1")],
      novelClaimIds: [],
      createdAt: 1
    })
    await feedbackRepository.saveFeedback({
      feedbackId: createFeedbackId("feedback_1"),
      resultId: createResultId("result_1"),
      type: "accurate",
      createdAt: 1
    })

    const exported = await exportLocalKnowledge(database)

    expect(exported.documents).toHaveLength(1)
    expect(exported.providers).toHaveLength(1)
    expect(exported.claims).toHaveLength(1)

    await resetLocalKnowledge(database)

    expect(await documentsRepository.countDocuments()).toBe(0)
    expect(await whitelistRepositoryForReset(database).listDomains()).toEqual([])
    await database.delete()
  })

  it("clears only the local article library while preserving settings, whitelist, and providers", async () => {
    const database = createTestDb()
    const settingsRepository = createSettingsRepository(database)
    const documentsRepository = createDocumentsRepository(database)
    const chunksRepository = createChunksRepository(database)
    const claimsRepository = createClaimsRepository(database)
    const embeddingsRepository = createEmbeddingsRepository(database)
    const resultsRepository = createResultsRepository(database)
    const feedbackRepository = createFeedbackRepository(database)
    const providersRepository = createProvidersRepository(database)
    const whitelistRepository = createWhitelistRepository(database)

    await settingsRepository.getSettings()
    await whitelistRepository.addDomain("example.com")
    await providersRepository.saveProvider({
      id: createProviderId("provider_1"),
      name: "OpenAI",
      type: "openai",
      baseUrl: "https://api.openai.com/v1",
      embeddingModels: ["text-embedding-3-small"],
      chatModels: ["gpt-4.1-mini"],
      supportsEmbedding: true,
      supportsChat: true,
      createdAt: 1,
      updatedAt: 1
    })
    await documentsRepository.saveDocument({
      docId: createDocumentId("doc_1"),
      url: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      domain: "example.com",
      title: "Example",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_1",
      extractor: "generic",
      status: "saved"
    })
    await chunksRepository.saveChunks([
      {
        chunkId: createChunkId("chunk_1"),
        docId: createDocumentId("doc_1"),
        text: "chunk text",
        startOffset: 0,
        endOffset: 10,
        charCount: 10,
        createdAt: 1
      }
    ])
    await claimsRepository.saveClaims([
      {
        claimId: createClaimId("claim_1"),
        docId: createDocumentId("doc_1"),
        chunkId: createChunkId("chunk_1"),
        text: "claim text",
        type: "fact",
        importance: 0.9,
        confidence: 0.8,
        entities: ["Example"],
        provider: "openai",
        model: "gpt-4.1-mini",
        createdAt: 1
      }
    ])
    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_1"),
        targetType: "claim",
        targetId: createClaimId("claim_1"),
        docId: createDocumentId("doc_1"),
        vector: [1, 0],
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        createdAt: 1
      }
    ])
    await resultsRepository.saveResult({
      resultId: createResultId("result_1"),
      docId: createDocumentId("doc_1"),
      duplicateScore: 0.5,
      noveltyScore: 0.5,
      recommendation: "skim",
      matchedClaimIds: [createClaimId("claim_1")],
      novelClaimIds: [],
      createdAt: 1
    })
    await feedbackRepository.saveFeedback({
      feedbackId: createFeedbackId("feedback_1"),
      resultId: createResultId("result_1"),
      type: "accurate",
      createdAt: 1
    })

    await clearArticleLibrary(database)

    expect(await documentsRepository.countDocuments()).toBe(0)
    expect(await chunksRepository.listByDocumentId(createDocumentId("doc_1"))).toEqual([])
    expect(await claimsRepository.listByDocumentId(createDocumentId("doc_1"))).toEqual([])
    expect(
      await embeddingsRepository.listByNamespace(
        createEmbeddingNamespaceId("openai:text-embedding-3-small:1536")
      )
    ).toEqual([])
    expect(await resultsRepository.getLatestByDocumentId(createDocumentId("doc_1"))).toBeUndefined()
    expect(await whitelistRepository.listDomains()).toEqual(["example.com"])
    expect(await providersRepository.listProviders()).toHaveLength(1)
    expect((await settingsRepository.getSettings()).id).toBe("global")
    await database.delete()
  })
})

function whitelistRepositoryForReset(database: ReturnType<typeof createCognitiveDeltaDb>) {
  return createWhitelistRepository(database)
}

function makeAnalysisJobFixture(jobId: string, createdAt: number) {
  return {
    jobId: createAnalysisJobId(jobId),
    docId: createDocumentId(`doc_${jobId}`),
    title: `Document ${jobId}`,
    url: `https://example.com/${jobId}`,
    canonicalUrl: `https://example.com/${jobId}`,
    document: {
      docId: createDocumentId(`doc_${jobId}`),
      url: `https://example.com/${jobId}`,
      canonicalUrl: `https://example.com/${jobId}`,
      domain: "example.com",
      title: `Document ${jobId}`,
      blocks: [
        {
          type: "paragraph" as const,
          text: "Fixture body"
        }
      ],
      extractor: "generic-article"
    },
    claimProviderId: createProviderId("provider_claim"),
    claimModel: "gpt-4.1-mini",
    embeddingProviderId: createProviderId("provider_embedding"),
    embeddingModel: "text-embedding-3-small",
    stage: "queued" as const,
    createdAt,
    completedTasks: 0,
    pendingTasks: 0,
    totalTasks: 0
  }
}
