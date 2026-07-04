import "fake-indexeddb/auto"

import { describe, expect, it } from "vitest"

import { createAnalysisPipeline } from "../../src/background/analysisPipeline"
import type { ClaimProvider, EmbeddingProvider, ExtractedClaim } from "../../src/ai/types"
import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createChunksRepository } from "../../src/db/chunksRepo"
import { createClaimsRepository } from "../../src/db/claimsRepo"
import { createDocumentsRepository } from "../../src/db/documentsRepo"
import { createEmbeddingsRepository } from "../../src/db/embeddingsRepo"
import { createResultsRepository } from "../../src/db/resultsRepo"
import {
  createClaimId,
  createChunkId,
  createDocumentId,
  createEmbeddingId,
  createEmbeddingNamespaceId,
  type ChunkRecord,
  type DocumentRecord,
  type EmbeddingRecord,
  type ExtractedDocument
} from "../../src/shared/types"

function buildDocument(): ExtractedDocument {
  return {
    docId: createDocumentId("doc_analysis"),
    url: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    domain: "example.com",
    title: "Analysis test",
    blocks: [
      {
        type: "paragraph",
        text: "OpenAI 发布了一个新插件。它可以识别文章中的重复信息，并提示用户是否值得继续阅读。".repeat(6)
      }
    ],
    extractor: "generic-article"
  }
}

function buildDocumentVariant(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    ...buildDocument(),
    ...overrides
  }
}

class FakeClaimProvider implements ClaimProvider {
  async extractClaims(input: {
    readonly docId: ReturnType<typeof createDocumentId>
    readonly chunks: readonly ChunkRecord[]
    readonly model: string
    readonly provider: string
  }): Promise<readonly ExtractedClaim[]> {
    const firstChunk = input.chunks[0]

    if (firstChunk === undefined) {
      throw new Error("Missing chunk")
    }

    return [
      {
        chunkId: firstChunk.chunkId,
        text: "OpenAI 发布了一个新插件。",
        type: "fact",
        importance: 0.8,
        confidence: 0.9,
        entities: ["OpenAI"]
      },
      {
        chunkId: firstChunk.chunkId,
        text: "它可以识别文章中的重复信息。",
        type: "fact",
        importance: 0.7,
        confidence: 0.88,
        entities: ["插件"]
      }
    ]
  }
}

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly calls: string[][] = []

  constructor(
    private readonly vector: readonly number[],
    private readonly modelName: string,
    private readonly dimensions: number
  ) {}

  async embed(input: {
    readonly texts: readonly string[]
    readonly model: string
  }): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }> {
    this.calls.push([...input.texts])
    return {
      vectors: input.texts.map(() => this.vector),
      model: this.modelName,
      dimensions: this.dimensions
    }
  }
}

class RoutedEmbeddingProvider implements EmbeddingProvider {
  readonly calls: string[][] = []

  constructor(
    private readonly vectorsByText: Readonly<Record<string, readonly number[]>>,
    private readonly modelName: string,
    private readonly dimensions: number
  ) {}

  async embed(input: {
    readonly texts: readonly string[]
    readonly model: string
  }): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }> {
    this.calls.push([...input.texts])

    return {
      vectors: input.texts.map((text) => this.vectorsByText[text] ?? [0, 1]),
      model: this.modelName,
      dimensions: this.dimensions
    }
  }
}

describe("analysis pipeline", () => {
  it("stores document, chunks, claims, embeddings, and result", async () => {
    const database = createCognitiveDeltaDb(`analysis-${crypto.randomUUID()}`)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const resultsRepository = createResultsRepository(database)
    const pipeline = createAnalysisPipeline({
      claimProvider: new FakeClaimProvider(),
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository: createEmbeddingsRepository(database),
      embeddingProvider,
      resultsRepository
    })

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.persisted).toBe(true)
    expect(result.claims).toHaveLength(2)
    expect(result.namespace).toBe(createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"))
    expect(result.result.recommendation).toBe("read")
    expect(result.judgement).toBe("complete")
    expect(result.result.novelClaimIds).toEqual([
      createClaimId("doc_analysis_claim_1"),
      createClaimId("doc_analysis_claim_2")
    ])
    expect(embeddingProvider.calls).toEqual([
      ["OpenAI 发布了一个新插件。"],
      ["它可以识别文章中的重复信息。"]
    ])
    expect(await createDocumentsRepository(database).countDocuments()).toBe(1)
    const persistedResult = await resultsRepository.getLatestByDocumentId(buildDocument().docId)
    expect(persistedResult?.novelClaimIds).toEqual([
      createClaimId("doc_analysis_claim_1"),
      createClaimId("doc_analysis_claim_2")
    ])
    await database.delete()
  })

  it("persists novel claim ids so cached article reloads can recover the novel-claims popup", async () => {
    const database = createCognitiveDeltaDb(`analysis-novel-claims-${crypto.randomUUID()}`)
    const documentsRepository = createDocumentsRepository(database)
    const chunksRepository = createChunksRepository(database)
    const claimsRepository = createClaimsRepository(database)
    const embeddingsRepository = createEmbeddingsRepository(database)
    const resultsRepository = createResultsRepository(database)
    const embeddingProvider = new RoutedEmbeddingProvider(
      {
        "OpenAI 发布了一个新插件。": [1, 0],
        "它可以识别文章中的重复信息。": [0, 1]
      },
      "text-embedding-3-small",
      1536
    )
    const pipeline = createAnalysisPipeline({
      claimProvider: new FakeClaimProvider(),
      chunksRepository,
      claimsRepository,
      documentsRepository,
      embeddingsRepository,
      embeddingProvider,
      resultsRepository
    })

    const historicalDocument: DocumentRecord = {
      docId: createDocumentId("doc_historical_duplicate"),
      url: "https://example.com/history",
      canonicalUrl: "https://example.com/history",
      domain: "example.com",
      title: "历史相似内容",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_historical_duplicate",
      extractor: "generic-article",
      status: "saved"
    }

    await documentsRepository.saveDocument(historicalDocument)
    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_historical_duplicate"),
        targetType: "claim",
        targetId: createClaimId("claim_historical_duplicate"),
        docId: historicalDocument.docId,
        vector: [1, 0],
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
        createdAt: 1
      }
    ])

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 1,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.novelClaims).toEqual(["它可以识别文章中的重复信息。"])
    expect(result.result.novelClaimIds).toEqual([createClaimId("doc_analysis_claim_2")])
    const persistedResult = await resultsRepository.getLatestByDocumentId(buildDocument().docId)
    expect(persistedResult?.novelClaimIds).toEqual([createClaimId("doc_analysis_claim_2")])
    expect(persistedResult?.matchedClaimIds).toEqual([createClaimId("doc_analysis_claim_1")])
    await database.delete()
  })

  it("returns similar source metadata with snippet, overlap, and url", async () => {
    const database = createCognitiveDeltaDb(`analysis-similar-${crypto.randomUUID()}`)
    const documentsRepository = createDocumentsRepository(database)
    const embeddingsRepository = createEmbeddingsRepository(database)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: new FakeClaimProvider(),
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository,
      embeddingsRepository,
      embeddingProvider,
      resultsRepository: createResultsRepository(database)
    })

    const historicalDocument: DocumentRecord = {
      docId: createDocumentId("doc_historical"),
      url: "https://example.com/history",
      canonicalUrl: "https://example.com/history",
      domain: "example.com",
      title: "历史相似片段",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_historical",
      extractor: "generic-article",
      status: "saved"
    }
    const historicalEmbedding: EmbeddingRecord = {
      embeddingId: createEmbeddingId("embedding_historical"),
      targetType: "claim",
      targetId: createClaimId("claim_historical"),
      docId: historicalDocument.docId,
      vector: [1, 0],
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
      createdAt: 1
    }
    const historicalChunk: ChunkRecord = {
      chunkId: createChunkId("chunk_historical"),
      docId: historicalDocument.docId,
      text: "历史相似片段：OpenAI 发布的插件可以识别文章中的重复信息。",
      startOffset: 0,
      endOffset: 31,
      charCount: 31,
      createdAt: 1
    }

    await documentsRepository.saveDocument(historicalDocument)
    await createChunksRepository(database).saveChunks([historicalChunk])
    await embeddingsRepository.saveEmbeddings([historicalEmbedding])

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 1,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.similarSources).toEqual([
      {
        similarity: 1,
        snippet: "历史相似片段：OpenAI 发布的插件可以识别文章中的重复信息。",
        url: "https://example.com/history"
      }
    ])
    await database.delete()
  })

  it("does not expose an uninformative short historical title as a similar source snippet", async () => {
    const database = createCognitiveDeltaDb(`analysis-similar-short-title-${crypto.randomUUID()}`)
    const documentsRepository = createDocumentsRepository(database)
    const chunksRepository = createChunksRepository(database)
    const embeddingsRepository = createEmbeddingsRepository(database)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: new FakeClaimProvider(),
      chunksRepository,
      claimsRepository: createClaimsRepository(database),
      documentsRepository,
      embeddingsRepository,
      embeddingProvider,
      resultsRepository: createResultsRepository(database)
    })

    const historicalDocument: DocumentRecord = {
      docId: createDocumentId("doc_historical_short_title"),
      url: "https://weibo.com/7465322154/R4gARAu6M?refer_flag=1001030103_",
      canonicalUrl: "https://weibo.com/7465322154/R4gARAu6M",
      domain: "weibo.com",
      title: "2x",
      readAt: 1,
      savedAt: 1,
      contentHash: "hash_historical_short_title",
      extractor: "feed-item",
      status: "saved"
    }
    const historicalChunk: ChunkRecord = {
      chunkId: createChunkId("chunk_historical_short_title"),
      docId: historicalDocument.docId,
      text: "Clawhunt 是一个 2026 年 AI 赏金平台，用户可以发布任务并让 AI Agent 自动接单完成。",
      startOffset: 0,
      endOffset: 52,
      charCount: 52,
      createdAt: 1
    }
    const historicalEmbedding: EmbeddingRecord = {
      embeddingId: createEmbeddingId("embedding_historical_short_title"),
      targetType: "claim",
      targetId: createClaimId("claim_historical_short_title"),
      docId: historicalDocument.docId,
      vector: [1, 0],
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      namespace: createEmbeddingNamespaceId("openai:text-embedding-3-small:1536"),
      createdAt: 1
    }

    await documentsRepository.saveDocument(historicalDocument)
    await chunksRepository.saveChunks([historicalChunk])
    await embeddingsRepository.saveEmbeddings([historicalEmbedding])

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 1,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.similarSources).toEqual([
      {
        similarity: 1,
        snippet:
          "Clawhunt 是一个 2026 年 AI 赏金平台，用户可以发布任务并让 AI Agent 自动接单完成。",
        url: "https://weibo.com/7465322154/R4gARAu6M?refer_flag=1001030103_"
      }
    ])
    expect(result.similarSources[0]?.snippet).not.toBe("2x")
    await database.delete()
  })

  it("reuses the existing persisted document for the same canonical url instead of creating duplicates", async () => {
    const database = createCognitiveDeltaDb(`analysis-reuse-url-${crypto.randomUUID()}`)
    const documentsRepository = createDocumentsRepository(database)
    const chunksRepository = createChunksRepository(database)
    const claimsRepository = createClaimsRepository(database)
    const embeddingsRepository = createEmbeddingsRepository(database)
    const resultsRepository = createResultsRepository(database)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: new FakeClaimProvider(),
      chunksRepository,
      claimsRepository,
      documentsRepository,
      embeddingsRepository,
      embeddingProvider,
      resultsRepository
    })

    await pipeline.analyzeDocument({
      document: buildDocumentVariant({
        docId: createDocumentId("doc_feed_version"),
        url: "https://weibo.com/1402400261/R4ct4n6tX?pagetype=profilefeed",
        canonicalUrl: "https://weibo.com/1402400261/R4ct4n6tX",
        domain: "weibo.com",
        title: "Feed version"
      }),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    await pipeline.analyzeDocument({
      document: buildDocumentVariant({
        docId: createDocumentId("doc_detail_version"),
        url: "https://weibo.com/1402400261/R4ct4n6tX?from=page_1005051402400261_profile&wvr=6",
        canonicalUrl: "https://weibo.com/1402400261/R4ct4n6tX",
        domain: "weibo.com",
        title: "Detail version"
      }),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 1,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    const savedDocuments = await documentsRepository.listDocuments()

    expect(savedDocuments).toHaveLength(1)
    expect(savedDocuments[0]?.docId).toBe(createDocumentId("doc_feed_version"))
    expect(savedDocuments[0]?.canonicalUrl).toBe("https://weibo.com/1402400261/R4ct4n6tX")

    expect(await chunksRepository.listByDocumentId(createDocumentId("doc_feed_version"))).toHaveLength(1)
    expect(await claimsRepository.listByDocumentId(createDocumentId("doc_feed_version"))).toHaveLength(2)
    expect(
      await embeddingsRepository.listByNamespace(
        createEmbeddingNamespaceId("openai:text-embedding-3-small:1536")
      )
    ).toHaveLength(2)
    expect(await resultsRepository.getLatestByDocumentId(createDocumentId("doc_feed_version"))).toBeDefined()
    expect(await resultsRepository.getLatestByDocumentId(createDocumentId("doc_detail_version"))).toBeUndefined()
    await database.delete()
  })

  it("returns insufficient-content when fewer than two informative claims remain after filtering", async () => {
    const database = createCognitiveDeltaDb(`analysis-insufficient-${crypto.randomUUID()}`)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: {
        async extractClaims(input) {
          const firstChunk = input.chunks[0]

          if (firstChunk === undefined) {
            throw new Error("Missing chunk")
          }

          return [
            {
              chunkId: firstChunk.chunkId,
              text: "2x",
              type: "fact",
              importance: 0.8,
              confidence: 0.9,
              entities: []
            },
            {
              chunkId: firstChunk.chunkId,
              text: "短句",
              type: "opinion",
              importance: 0.6,
              confidence: 0.8,
              entities: []
            }
          ]
        }
      },
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository: createEmbeddingsRepository(database),
      embeddingProvider,
      resultsRepository: createResultsRepository(database)
    })

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.judgement).toBe("insufficient-content")
    expect(result.claims).toEqual([])
    expect(result.duplicateClaims).toEqual([])
    expect(result.novelClaims).toEqual([])
    expect(embeddingProvider.calls).toEqual([])
    await database.delete()
  })

  it("allows a weibo article with one informative claim to complete analysis", async () => {
    const database = createCognitiveDeltaDb(`analysis-weibo-short-form-${crypto.randomUUID()}`)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: {
        async extractClaims(input) {
          const firstChunk = input.chunks[0]

          if (firstChunk === undefined) {
            throw new Error("Missing chunk")
          }

          return [
            {
              chunkId: firstChunk.chunkId,
              text: "OpenAI 将在 7 月发布新的 Agent 功能。",
              type: "event",
              importance: 0.9,
              confidence: 0.92,
              entities: ["OpenAI"]
            },
            {
              chunkId: firstChunk.chunkId,
              text: "2x",
              type: "fact",
              importance: 0.1,
              confidence: 0.4,
              entities: []
            }
          ]
        }
      },
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository: createEmbeddingsRepository(database),
      embeddingProvider,
      resultsRepository: createResultsRepository(database)
    })

    const result = await pipeline.analyzeDocument({
      document: buildDocumentVariant({
        url: "https://weibo.com/1234567890/R6fdT01VI",
        canonicalUrl: "https://weibo.com/1234567890/R6fdT01VI",
        domain: "weibo.com",
        title: "微博单篇正文",
        extractor: "weibo-article",
        blocks: [
          {
            type: "paragraph",
            text: "OpenAI 将在 7 月发布新的 Agent 功能，并先向企业用户开放申请入口。"
          }
        ]
      }),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.judgement).toBe("complete")
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0]?.text).toBe("OpenAI 将在 7 月发布新的 Agent 功能。")
    expect(result.novelClaims).toEqual(["OpenAI 将在 7 月发布新的 Agent 功能。"])
    expect(embeddingProvider.calls).toEqual([["OpenAI 将在 7 月发布新的 Agent 功能。"]])
    await database.delete()
  })

  it("allows a short weibo article body to complete analysis when it still contains one clear claim", async () => {
    const database = createCognitiveDeltaDb(`analysis-weibo-short-body-${crypto.randomUUID()}`)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: {
        async extractClaims(input) {
          const firstChunk = input.chunks[0]

          if (firstChunk === undefined) {
            throw new Error("Missing chunk")
          }

          return [
            {
              chunkId: firstChunk.chunkId,
              text: "苹果今天发布新芯片 M5。",
              type: "event",
              importance: 0.88,
              confidence: 0.91,
              entities: ["苹果", "M5"]
            }
          ]
        }
      },
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository: createEmbeddingsRepository(database),
      embeddingProvider,
      resultsRepository: createResultsRepository(database)
    })

    const result = await pipeline.analyzeDocument({
      document: buildDocumentVariant({
        url: "https://weibo.com/2194035935/R6jFpmsGI",
        canonicalUrl: "https://weibo.com/2194035935/R6jFpmsGI",
        domain: "weibo.com",
        title: "短微博正文",
        extractor: "weibo-article",
        blocks: [
          {
            type: "paragraph",
            text: "苹果今天发布新芯片 M5。"
          }
        ]
      }),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.judgement).toBe("complete")
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0]?.text).toBe("苹果今天发布新芯片 M5。")
    expect(embeddingProvider.calls).toEqual([["苹果今天发布新芯片 M5。"]])
    await database.delete()
  })

  it("falls back to a meaningful short-form social chunk when claim extraction returns no informative claims", async () => {
    const database = createCognitiveDeltaDb(`analysis-weibo-fallback-${crypto.randomUUID()}`)
    const embeddingProvider = new FakeEmbeddingProvider([1, 0], "text-embedding-3-small", 1536)
    const pipeline = createAnalysisPipeline({
      claimProvider: {
        async extractClaims(input) {
          const firstChunk = input.chunks[0]

          if (firstChunk === undefined) {
            throw new Error("Missing chunk")
          }

          return [
            {
              chunkId: firstChunk.chunkId,
              text: "2x",
              type: "fact",
              importance: 0.1,
              confidence: 0.2,
              entities: []
            }
          ]
        }
      },
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository: createEmbeddingsRepository(database),
      embeddingProvider,
      resultsRepository: createResultsRepository(database)
    })

    const bodyText =
      "昨天交了两个项目，6月的工作终于算快完成了。今天7月的项目也开始进入筹备，一个接一个，没有时间绝望。"
    const result = await pipeline.analyzeDocument({
      document: buildDocumentVariant({
        url: "https://weibo.com/2694995107/R6kF1tGd5",
        canonicalUrl: "https://weibo.com/2694995107/R6kF1tGd5",
        domain: "weibo.com",
        title: "微博短正文",
        extractor: "weibo-article",
        blocks: [
          {
            type: "paragraph",
            text: bodyText
          }
        ]
      }),
      claimModel: "gpt-4.1-mini",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "text-embedding-3-small",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.judgement).toBe("complete")
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0]?.text).toBe(bodyText)
    expect(result.novelClaims).toEqual([bodyText])
    expect(embeddingProvider.calls).toEqual([[bodyText]])
    await database.delete()
  })
})
