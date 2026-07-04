import "fake-indexeddb/auto"

import { describe, expect, it } from "vitest"

import { createAnalysisPipeline } from "../../src/background/analysisPipeline"
import type { ClaimProvider, EmbeddingProvider, ExtractedClaim } from "../../src/ai/types"
import { createClaimsRepository } from "../../src/db/claimsRepo"
import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createDocumentsRepository } from "../../src/db/documentsRepo"
import { createEmbeddingsRepository } from "../../src/db/embeddingsRepo"
import { createResultsRepository } from "../../src/db/resultsRepo"
import { createChunksRepository } from "../../src/db/chunksRepo"
import {
  createChunkId,
  createClaimId,
  createDocumentId,
  createEmbeddingId,
  createEmbeddingNamespaceId,
  type ChunkRecord,
  type ExtractedDocument
} from "../../src/shared/types"

function buildDocument(): ExtractedDocument {
  return {
    docId: createDocumentId("doc_namespace"),
    url: "https://example.com/namespace",
    canonicalUrl: "https://example.com/namespace",
    domain: "example.com",
    title: "Namespace test",
    blocks: [
      {
        type: "paragraph",
        text: "同样的 claim 进入不同 namespace 后不能直接比较。".repeat(8)
      }
    ],
    extractor: "generic-article"
  }
}

class NamespaceClaimProvider implements ClaimProvider {
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
        text: "同样的 claim 进入不同 namespace 后不能直接比较。",
        type: "fact",
        importance: 0.9,
        confidence: 0.9,
        entities: []
      }
    ]
  }
}

class NamespaceEmbeddingProvider implements EmbeddingProvider {
  async embed(input: {
    readonly texts: readonly string[]
    readonly model: string
  }): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }> {
    return {
      vectors: input.texts.map(() => [1, 0]),
      model: input.model,
      dimensions: input.model === "model-large" ? 3072 : 1536
    }
  }
}

describe("namespace isolation", () => {
  it("ignores historical embeddings from a different namespace", async () => {
    const database = createCognitiveDeltaDb(`namespace-${crypto.randomUUID()}`)
    const embeddingsRepository = createEmbeddingsRepository(database)

    await embeddingsRepository.saveEmbeddings([
      {
        embeddingId: createEmbeddingId("embedding_old"),
        targetType: "claim",
        targetId: createClaimId("claim_old"),
        docId: createDocumentId("doc_old"),
        vector: [1, 0],
        provider: "openai",
        model: "model-small",
        dimensions: 1536,
        namespace: createEmbeddingNamespaceId("openai:model-small:1536"),
        createdAt: 1
      }
    ])

    const pipeline = createAnalysisPipeline({
      claimProvider: new NamespaceClaimProvider(),
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository: createDocumentsRepository(database),
      embeddingsRepository,
      embeddingProvider: new NamespaceEmbeddingProvider(),
      resultsRepository: createResultsRepository(database)
    })

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "claim-model",
      claimProviderName: "openai",
      currentDocumentCount: 0,
      embeddingModel: "model-large",
      embeddingProviderName: "openai",
      maxDocuments: 1000
    })

    expect(result.result.duplicateScore).toBe(0)
    await database.delete()
  })
})
