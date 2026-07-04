import "fake-indexeddb/auto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { buildArticlePrecheck } from "../../src/background/articlePrecheck"
import { createApiRouter } from "../../src/background/apiRouter"
import type { EmbeddingProvider } from "../../src/ai/types"
import { createClaimsRepository } from "../../src/db/claimsRepo"
import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createDocumentsRepository } from "../../src/db/documentsRepo"
import { createEmbeddingsRepository } from "../../src/db/embeddingsRepo"
import { startArticlePrecheckFlow } from "../../src/content/articlePrecheckFlow"
import {
  createChunkId,
  createClaimId,
  createDocumentId,
  createEmbeddingId,
  createEmbeddingNamespaceId,
  createResultId
} from "../../src/shared/types"

function createTestDb() {
  return createCognitiveDeltaDb(`article-precheck-${crypto.randomUUID()}`)
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

const INFORMATIVE_COMPACT_TEXT =
  "OpenAI 发布了一个新插件，并明确说明它可以识别文章中的重复信息，帮助用户判断是否值得继续阅读。"

describe("article precheck", () => {
  it("returns already-read when canonicalUrl already exists", async () => {
    const database = createTestDb()
    const router = createApiRouter(database)

    await saveExistingDocument(database, {
      canonicalUrl: "https://example.com/article",
      url: "https://example.com/article?src=feed"
    })

    await expect(
      router.checkDocumentUrlHistory({
        canonicalUrl: "https://example.com/article",
        url: "https://example.com/article?src=feed"
      })
    ).resolves.toEqual({
      duplicateScore: 1,
      kind: "already-read"
    })
    await database.delete()
  })

  it("returns already-read after cleaning current-page url params and matching a historically dirty stored weibo url", async () => {
    const database = createTestDb()
    const router = createApiRouter(database)

    await database.documents.put({
      docId: createDocumentId("doc_weibo_dirty_url"),
      url: "https://www.weibo.com/1433680664/R6RcP4wLB?pagetype=homefeed",
      canonicalUrl: "https://www.weibo.com/1433680664/R6RcP4wLB?pagetype=homefeed",
      domain: "www.weibo.com",
      title: "Dirty stored weibo article",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_weibo_dirty",
      extractor: "weibo-article",
      status: "saved"
    })

    await expect(
      router.checkDocumentUrlHistory({
        canonicalUrl: "https://weibo.com/1433680664/R6RcP4wLB",
        url: "https://weibo.com/1433680664/R6RcP4wLB?pagetype=homefeed"
      })
    ).resolves.toEqual({
      duplicateScore: 1,
      kind: "already-read"
    })
    await database.delete()
  })

  it("returns already-read after cleaning x status url params and matching a historically dirty stored x url", async () => {
    const database = createTestDb()
    const router = createApiRouter(database)

    await database.documents.put({
      docId: createDocumentId("doc_x_dirty_url"),
      url: "https://www.x.com/dotey/status/2059729329119006928?s=20&t=abc123",
      canonicalUrl: "https://www.x.com/dotey/status/2059729329119006928?s=20&t=abc123",
      domain: "www.x.com",
      title: "Dirty stored x article",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_x_dirty",
      extractor: "x-article",
      status: "saved"
    })

    await expect(
      router.checkDocumentUrlHistory({
        canonicalUrl: "https://x.com/dotey/status/2059729329119006928",
        url: "https://x.com/dotey/status/2059729329119006928?src=timeline"
      })
    ).resolves.toEqual({
      duplicateScore: 1,
      kind: "already-read"
    })
    await database.delete()
  })

  it("returns the latest stored analysis result for an already analyzed document url", async () => {
    const database = createTestDb()
    const router = createApiRouter(database)

    await saveExistingDocument(database, {
      canonicalUrl: "https://example.com/article",
      url: "https://example.com/article?src=feed"
    })
    await saveExistingResult(database, {
      docId: createDocumentId("doc_existing"),
      duplicateScore: 0.53,
      recommendation: "skim"
    })

    await expect(
      router.getExistingAnalysisResult({
        canonicalUrl: "https://example.com/article",
        url: "https://example.com/article?src=feed"
      })
    ).resolves.toEqual({
      duplicateScore: 0.53,
      novelClaims: [],
      recommendation: "skim",
      sourceExtractor: "generic-article"
    })
    await database.delete()
  })

  it("prefers the richer completed analysis result across duplicate social-url records", async () => {
    const database = createTestDb()
    const router = createApiRouter(database)
    const documentsRepository = createDocumentsRepository(database)
    const claimsRepository = createClaimsRepository(database)

    await documentsRepository.saveDocument({
      docId: createDocumentId("doc_weibo_stale"),
      url: "https://www.weibo.com/1657210044/R6PwixIhq",
      canonicalUrl: "https://www.weibo.com/1657210044/R6PwixIhq",
      domain: "www.weibo.com",
      title: "Stale weibo article",
      readAt: 0,
      savedAt: 1,
      contentHash: "hash_weibo_stale",
      extractor: "weibo-article",
      status: "analyzed"
    })
    await saveExistingResult(database, {
      docId: createDocumentId("doc_weibo_stale"),
      duplicateScore: 0.53,
      recommendation: "skim",
      judgement: "insufficient-content"
    })

    await documentsRepository.saveDocument({
      docId: createDocumentId("doc_weibo_good"),
      url: "https://weibo.com/1657210044/R6PwixIhq",
      canonicalUrl: "https://weibo.com/1657210044/R6PwixIhq",
      domain: "weibo.com",
      title: "Good weibo article",
      readAt: 0,
      savedAt: 2,
      contentHash: "hash_weibo_good",
      extractor: "feed-item",
      status: "analyzed"
    })
    await claimsRepository.saveClaims([
      {
        claimId: createClaimId("claim_weibo_novel"),
        docId: createDocumentId("doc_weibo_good"),
        chunkId: createChunkId("chunk_weibo_good"),
        text: "这是一条应该在详情页 KDB hover 时重新出现的新知识点。",
        type: "fact",
        importance: 0.8,
        confidence: 0.9,
        entities: [],
        provider: "openai",
        model: "gpt-4.1-mini",
        createdAt: 2
      }
    ])
    await database.analysisResults.put({
      resultId: createResultId("result_doc_weibo_good"),
      docId: createDocumentId("doc_weibo_good"),
      duplicateScore: 0,
      noveltyScore: 1,
      recommendation: "read",
      matchedClaimIds: [],
      novelClaimIds: [createClaimId("claim_weibo_novel")],
      createdAt: 2
    })

    await expect(
      router.getExistingAnalysisResult({
        canonicalUrl: "https://weibo.com/1657210044/R6PwixIhq",
        url: "https://weibo.com/1657210044/R6PwixIhq"
      })
    ).resolves.toEqual({
      duplicateScore: 0,
      novelClaims: ["这是一条应该在详情页 KDB hover 时重新出现的新知识点。"],
      recommendation: "read",
      sourceExtractor: "feed-item"
    })
    await database.delete()
  })

  it("does not treat analyzed-but-unread documents as already read", async () => {
    const database = createTestDb()
    const router = createApiRouter(database)

    await saveAnalyzedDocument(database, {
      canonicalUrl: "https://example.com/article",
      url: "https://example.com/article?src=feed"
    })
    await saveExistingResult(database, {
      docId: createDocumentId("doc_analyzed"),
      duplicateScore: 0.53,
      recommendation: "skim"
    })

    await expect(
      router.checkDocumentUrlHistory({
        canonicalUrl: "https://example.com/article",
        url: "https://example.com/article?src=feed"
      })
    ).resolves.toBeNull()
    await database.delete()
  })

  it("fails open to unknown-duplicate when no matching namespace exists", async () => {
    const database = createTestDb()

    await expect(
      buildArticlePrecheck({
        documentsRepository: createDocumentsRepository(database),
        embeddingsRepository: createEmbeddingsRepository(database),
        embeddingModel: "text-embedding-3-small",
        embeddingProvider: new StaticEmbeddingProvider([[1, 0]], "text-embedding-3-small", 1536),
        embeddingProviderName: "openai"
      }).run({
        canonicalUrl: "https://example.com/article",
        compactText: INFORMATIVE_COMPACT_TEXT,
        url: "https://example.com/article"
      })
    ).resolves.toMatchObject({
      duplicateScore: null,
      kind: "unknown-duplicate"
    })
    await database.delete()
  })

  it("marks high duplicate when best similarity maps to 50 percent or above", async () => {
    const database = createTestDb()
    const embeddingsRepository = createEmbeddingsRepository(database)
    const namespace = createEmbeddingNamespaceId("openai:text-embedding-3-small:1536")

    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_existing"),
        targetType: "claim",
        targetId: createClaimId("claim_existing"),
        docId: createDocumentId("doc_existing"),
        vector: [1, 0],
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        namespace,
        createdAt: 1
      }
    ])

    const result = await buildArticlePrecheck({
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository,
      activeEmbeddingNamespace: namespace,
      embeddingModel: "text-embedding-3-small",
      embeddingProvider: new StaticEmbeddingProvider(
        [[0.62, Math.sqrt(1 - 0.62 * 0.62)]],
        "text-embedding-3-small",
        1536
      ),
      embeddingProviderName: "openai"
    }).run({
      canonicalUrl: "https://example.com/article",
      compactText: INFORMATIVE_COMPACT_TEXT,
      url: "https://example.com/article"
    })

    expect(result.kind).toBe("high-duplicate")
    expect(result.duplicateScore).toBeCloseTo(0.62, 2)
    await database.delete()
  })

  it("returns precheck-failed when the provider request throws", async () => {
    const database = createTestDb()
    const embeddingsRepository = createEmbeddingsRepository(database)
    const namespace = createEmbeddingNamespaceId("openai:text-embedding-3-small:1536")

    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_existing"),
        targetType: "claim",
        targetId: createClaimId("claim_existing"),
        docId: createDocumentId("doc_existing"),
        vector: [1, 0],
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        namespace,
        createdAt: 1
      }
    ])

    const result = await buildArticlePrecheck({
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository,
      activeEmbeddingNamespace: namespace,
      embeddingModel: "text-embedding-3-small",
      embeddingProvider: new ThrowingEmbeddingProvider(),
      embeddingProviderName: "openai"
    }).run({
      canonicalUrl: "https://example.com/article",
      compactText: INFORMATIVE_COMPACT_TEXT,
      url: "https://example.com/article"
    })

    expect(result).toMatchObject({
      duplicateScore: null,
      kind: "precheck-failed"
    })
    await database.delete()
  })

  it("returns insufficient-content for compact texts that lack enough information", async () => {
    const database = createTestDb()

    await expect(
      buildArticlePrecheck({
        documentsRepository: createDocumentsRepository(database),
        embeddingsRepository: createEmbeddingsRepository(database),
        embeddingModel: "text-embedding-3-small",
        embeddingProvider: new StaticEmbeddingProvider([[1, 0]], "text-embedding-3-small", 1536),
        embeddingProviderName: "openai"
      }).run({
        canonicalUrl: "https://example.com/article",
        compactText: "2x",
        url: "https://example.com/article"
      })
    ).resolves.toMatchObject({
      duplicateScore: null,
      kind: "insufficient-content"
    })
    await database.delete()
  })

  it("immediately enqueues analysis for a new article instead of starting auto-read countdown", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn()
    }
    const enqueueAnalysisJob = vi.fn(async () => undefined)
    const startAutoReadCountdown = vi.fn(async () => undefined)
    const runDuplicatePrecheck = vi.fn(async () => ({
      duplicateScore: 0.24,
      kind: "low-duplicate" as const
    }))

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => null),
      document: {
        docId: createDocumentId("doc_new_article"),
        url: "https://example.com/new-article",
        canonicalUrl: "https://example.com/new-article",
        domain: "example.com",
        title: "A new article",
        blocks: [{ type: "paragraph", text: "Fresh body" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob,
      marker,
      markDocumentRead: vi.fn(async () => undefined),
      runDuplicatePrecheck,
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown
    })

    expect(enqueueAnalysisJob).toHaveBeenCalledTimes(1)
    expect(startAutoReadCountdown).not.toHaveBeenCalled()
    expect(runDuplicatePrecheck).not.toHaveBeenCalled()
  })

  it("shows insufficient-content instead of manual or auto actions when cached analysis cannot judge the article", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn()
    }

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0,
        judgement: "insufficient-content" as const,
        recommendation: "read" as const
      })),
      document: {
        docId: createDocumentId("doc_insufficient_article"),
        url: "https://example.com/insufficient-article",
        canonicalUrl: "https://example.com/insufficient-article",
        domain: "example.com",
        title: "Insufficient article",
        blocks: [{ type: "paragraph", text: "2x" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob: vi.fn(async () => undefined),
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck: vi.fn(),
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown: vi.fn(async () => undefined)
    })

    expect(marker.setState).toHaveBeenCalledWith({
      kind: "insufficient-content"
    })
  })

  it("re-enqueues social documents when a cached insufficient-content result may be stale", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn()
    }
    const enqueueAnalysisJob = vi.fn(async () => undefined)

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0,
        judgement: "insufficient-content" as const,
        recommendation: "read" as const
      })),
      document: {
        docId: createDocumentId("doc_retry_social_article"),
        url: "https://weibo.com/2194035935/R6jFpmsGI",
        canonicalUrl: "https://weibo.com/2194035935/R6jFpmsGI",
        domain: "weibo.com",
        title: "微博单篇正文",
        blocks: [{ type: "paragraph", text: "真实微博正文内容" }],
        extractor: "weibo-article"
      },
      enqueueAnalysisJob,
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck: vi.fn(),
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown: vi.fn(async () => undefined)
    })

    expect(marker.setState).toHaveBeenCalledWith({
      kind: "queued"
    })
    expect(enqueueAnalysisJob).toHaveBeenCalledTimes(1)
  })

  it("shows a stored analysis result immediately for an already-read article", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn(),
      showNovelClaimsOverlay: vi.fn()
    }
    const runDuplicatePrecheck = vi.fn()
    const startAutoReadCountdown = vi.fn(async () => undefined)

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => ({
        duplicateScore: 1,
        kind: "already-read" as const
      })),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0.53,
        novelClaims: ["新增 claim A", "新增 claim B"],
        recommendation: "skim" as const
      })),
      document: {
        docId: createDocumentId("doc_existing_article"),
        url: "https://example.com/existing-article",
        canonicalUrl: "https://example.com/existing-article",
        domain: "example.com",
        title: "Existing article",
        blocks: [{ type: "paragraph", text: "Existing body" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob: vi.fn(async () => undefined),
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck,
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown
    })

    expect(marker.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "completed",
        hideAction: true,
        text: "重复度 53% · 建议略读"
      })
    )
    expect(marker.showNovelClaimsOverlay).toHaveBeenCalledWith({
      claims: ["新增 claim A", "新增 claim B"],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })
    expect(runDuplicatePrecheck).not.toHaveBeenCalled()
    expect(startAutoReadCountdown).not.toHaveBeenCalled()
  })

  it("primes an empty KDB hover popup when a cached article has no novel claims", async () => {
    const marker = {
      primeNovelClaimsOverlay: vi.fn(),
      setState: vi.fn(),
      setStatus: vi.fn(),
      showNovelClaimsOverlay: vi.fn()
    }

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => ({
        duplicateScore: 1,
        kind: "already-read" as const
      })),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0.53,
        novelClaims: [],
        recommendation: "skim" as const
      })),
      document: {
        docId: createDocumentId("doc_existing_article_no_novel"),
        url: "https://example.com/existing-article-no-novel",
        canonicalUrl: "https://example.com/existing-article-no-novel",
        domain: "example.com",
        title: "Existing article no novel",
        blocks: [{ type: "paragraph", text: "Existing body" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob: vi.fn(async () => undefined),
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck: vi.fn(),
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown: vi.fn(async () => undefined)
    })

    expect(marker.primeNovelClaimsOverlay).toHaveBeenCalledWith({
      claims: [],
      durationMs: 20_000,
      maxVisibleClaims: 5
    })
    expect(marker.showNovelClaimsOverlay).not.toHaveBeenCalled()
  })

  it("shows the duplicate score and manual mark-read action for unread manual articles with cached analysis", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn()
    }
    const startAutoReadCountdown = vi.fn(async () => undefined)
    const enqueueAnalysisJob = vi.fn(async () => undefined)
    const runDuplicatePrecheck = vi.fn()

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0.53,
        recommendation: "skim" as const
      })),
      document: {
        docId: createDocumentId("doc_manual_article"),
        url: "https://example.com/manual-article",
        canonicalUrl: "https://example.com/manual-article",
        domain: "example.com",
        title: "Manual article",
        blocks: [{ type: "paragraph", text: "Manual body" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob,
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck,
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown
    })

    expect(marker.setState).toHaveBeenCalledWith({
      kind: "manual-ready",
      duplicateScore: 0.53
    })
    expect(enqueueAnalysisJob).not.toHaveBeenCalled()
    expect(runDuplicatePrecheck).not.toHaveBeenCalled()
    expect(startAutoReadCountdown).not.toHaveBeenCalled()
  })

  it("re-enqueues a weibo detail page when the cached analysis came from a feed-item extraction", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn(),
      showNovelClaimsOverlay: vi.fn()
    }
    const enqueueAnalysisJob = vi.fn(async () => undefined)

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0.12,
        novelClaims: ["旧的 feed claim"],
        recommendation: "read" as const,
        sourceExtractor: "feed-item"
      })),
      document: {
        docId: createDocumentId("doc_weibo_detail_retry"),
        url: "https://weibo.com/2194035935/R6jFpmsGI",
        canonicalUrl: "https://weibo.com/2194035935/R6jFpmsGI",
        domain: "weibo.com",
        title: "微博详情页",
        blocks: [{ type: "paragraph", text: "微博详情页完整正文" }],
        extractor: "weibo-article"
      },
      enqueueAnalysisJob,
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck: vi.fn(),
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown: vi.fn(async () => undefined)
    })

    expect(marker.setState).toHaveBeenCalledWith({ kind: "queued" })
    expect(enqueueAnalysisJob).toHaveBeenCalledTimes(1)
    expect(marker.showNovelClaimsOverlay).not.toHaveBeenCalled()
  })

  it("starts auto-read countdown from cached analysis for unread auto articles", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn()
    }
    const startAutoReadCountdown = vi.fn(async () => undefined)
    const enqueueAnalysisJob = vi.fn(async () => undefined)
    const runDuplicatePrecheck = vi.fn()

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0.53,
        recommendation: "skim" as const
      })),
      document: {
        docId: createDocumentId("doc_auto_article"),
        url: "https://example.com/auto-article",
        canonicalUrl: "https://example.com/auto-article",
        domain: "example.com",
        title: "Auto article",
        blocks: [{ type: "paragraph", text: "Auto body" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob,
      markDocumentRead: vi.fn(async () => undefined),
      marker,
      runDuplicatePrecheck,
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "auto",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown
    })

    expect(startAutoReadCountdown).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateScore: 0.53,
        kind: "countdown"
      })
    )
    expect(enqueueAnalysisJob).not.toHaveBeenCalled()
    expect(runDuplicatePrecheck).not.toHaveBeenCalled()
  })

  it("marks an analyzed manual article as read when the user triggers mark-read", async () => {
    const marker = {
      setState: vi.fn(),
      setStatus: vi.fn(),
      showKnowledgeGain: vi.fn()
    }
    const markDocumentRead = vi.fn(async () => undefined)

    await startArticlePrecheckFlow({
      checkUrlHistory: vi.fn(async () => null),
      getExistingAnalysisResult: vi.fn(async () => ({
        duplicateScore: 0.53,
        novelClaims: ["新增 claim A", "新增 claim B"],
        recommendation: "skim" as const
      })),
      document: {
        docId: createDocumentId("doc_mark_read"),
        url: "https://example.com/mark-read-article",
        canonicalUrl: "https://example.com/mark-read-article",
        domain: "example.com",
        title: "Manual article",
        blocks: [{ type: "paragraph", text: "Manual body" }],
        extractor: "generic-article"
      },
      enqueueAnalysisJob: vi.fn(async () => undefined),
      markDocumentRead,
      manualTrigger: true,
      marker,
      runDuplicatePrecheck: vi.fn(),
      settings: {
        autoAnalyzeEnabled: true,
        debugLoggingEnabled: true,
        dwellThresholdSeconds: 1,
        novelClaimsOverlaySeconds: 20,
        novelClaimsOverlayMaxVisible: 5,
        singleArticleReadMode: "manual",
        feedItemReadMode: "manual"
      },
      startAutoReadCountdown: vi.fn(async () => undefined)
    })

    expect(markDocumentRead).toHaveBeenCalledTimes(1)
    expect(marker.showKnowledgeGain).toHaveBeenCalledWith({ count: 2 })
    expect(marker.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "completed",
        hideAction: true,
        text: "重复度 53% · 建议略读"
      })
    )
  })
})

class StaticEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly vectors: readonly (readonly number[])[],
    private readonly model: string,
    private readonly dimensions: number
  ) {}

  async embed(): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }> {
    return {
      vectors: this.vectors,
      model: this.model,
      dimensions: this.dimensions
    }
  }
}

class ThrowingEmbeddingProvider implements EmbeddingProvider {
  async embed(): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }> {
    throw new Error("Embedding request failed")
  }
}

async function saveExistingDocument(
  database: ReturnType<typeof createCognitiveDeltaDb>,
  input: {
    readonly canonicalUrl: string
    readonly url: string
  }
): Promise<void> {
  await createDocumentsRepository(database).saveDocument({
    docId: createDocumentId("doc_existing"),
    url: input.url,
    canonicalUrl: input.canonicalUrl,
    domain: "example.com",
    title: "Existing article",
    readAt: 1,
    savedAt: 1,
    contentHash: "hash_existing",
    extractor: "generic-article",
    status: "saved"
  })
}

async function saveAnalyzedDocument(
  database: ReturnType<typeof createCognitiveDeltaDb>,
  input: {
    readonly canonicalUrl: string
    readonly url: string
  }
): Promise<void> {
  await createDocumentsRepository(database).saveDocument({
    docId: createDocumentId("doc_analyzed"),
    url: input.url,
    canonicalUrl: input.canonicalUrl,
    domain: "example.com",
    title: "Analyzed article",
    readAt: 0,
    savedAt: 1,
    contentHash: "hash_analyzed",
    extractor: "generic-article",
    status: "analyzed"
  })
}

async function saveExistingResult(
  database: ReturnType<typeof createCognitiveDeltaDb>,
  input: {
    readonly docId: ReturnType<typeof createDocumentId>
    readonly duplicateScore: number
    readonly judgement?: "complete" | "insufficient-content"
    readonly recommendation: "read" | "skim" | "skip"
  }
): Promise<void> {
  await database.analysisResults.put({
    resultId: createResultId(`result_${input.docId}`),
    docId: input.docId,
    ...(input.judgement === undefined ? {} : { judgement: input.judgement }),
    duplicateScore: input.duplicateScore,
    noveltyScore: 1 - input.duplicateScore,
    recommendation: input.recommendation,
    matchedClaimIds: [],
    novelClaimIds: [],
    createdAt: 1
  })
}
