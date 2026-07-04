import "fake-indexeddb/auto"

import { describe, expect, it } from "vitest"

import { createAnalysisPipeline } from "../../src/background/analysisPipeline"
import type { ClaimProvider, EmbeddingProvider, ExtractedClaim } from "../../src/ai/types"
import { createChunksRepository } from "../../src/db/chunksRepo"
import { createClaimsRepository } from "../../src/db/claimsRepo"
import { createCognitiveDeltaDb } from "../../src/db/indexeddb"
import { createDocumentsRepository } from "../../src/db/documentsRepo"
import { createEmbeddingsRepository } from "../../src/db/embeddingsRepo"
import { createResultsRepository } from "../../src/db/resultsRepo"
import {
  createChunkId,
  createDocumentId,
  type ChunkRecord,
  type DocumentRecord,
  type ExtractedDocument
} from "../../src/shared/types"

function buildDocument(): ExtractedDocument {
  return {
    docId: createDocumentId("doc_capacity"),
    url: "https://example.com/capacity",
    canonicalUrl: "https://example.com/capacity",
    domain: "example.com",
    title: "Capacity test",
    blocks: [
      {
        type: "paragraph",
        text: "当知识库容量已满时，当前页面仍然应该被临时分析，但不应自动保存。".repeat(8)
      }
    ],
    extractor: "generic-article"
  }
}

class CapacityClaimProvider implements ClaimProvider {
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
        text: "容量已满时仍然可以临时分析。",
        type: "fact",
        importance: 0.7,
        confidence: 0.9,
        entities: []
      }
    ]
  }
}

class CapacityEmbeddingProvider implements EmbeddingProvider {
  async embed(input: {
    readonly texts: readonly string[]
    readonly model: string
  }): Promise<{
    readonly vectors: readonly (readonly number[])[]
    readonly model: string
    readonly dimensions: number
  }> {
    return {
      vectors: input.texts.map(() => [0.4, 0.6]),
      model: input.model,
      dimensions: 1536
    }
  }
}

describe("capacity flow", () => {
  it("analyzes without persisting a new document when capacity is full", async () => {
    const database = createCognitiveDeltaDb(`capacity-${crypto.randomUUID()}`)
    const documentsRepository = createDocumentsRepository(database)

    const existingDocuments: DocumentRecord[] = Array.from({ length: 2 }, (_, index) => ({
      docId: createDocumentId(`doc_existing_${index}`),
      url: `https://example.com/${index}`,
      canonicalUrl: `https://example.com/${index}`,
      domain: "example.com",
      title: `Existing ${index}`,
      readAt: index,
      savedAt: index,
      contentHash: `hash_${index}`,
      extractor: "generic",
      status: "saved"
    }))

    for (const documentRecord of existingDocuments) {
      await documentsRepository.saveDocument(documentRecord)
    }

    const pipeline = createAnalysisPipeline({
      claimProvider: new CapacityClaimProvider(),
      chunksRepository: createChunksRepository(database),
      claimsRepository: createClaimsRepository(database),
      documentsRepository,
      embeddingsRepository: createEmbeddingsRepository(database),
      embeddingProvider: new CapacityEmbeddingProvider(),
      resultsRepository: createResultsRepository(database)
    })

    const result = await pipeline.analyzeDocument({
      document: buildDocument(),
      claimModel: "claim-model",
      claimProviderName: "openai",
      currentDocumentCount: 2,
      embeddingModel: "embed-model",
      embeddingProviderName: "openai",
      maxDocuments: 2
    })

    expect(result.persisted).toBe(false)
    expect(await documentsRepository.countDocuments()).toBe(2)
    await database.delete()
  })
})
