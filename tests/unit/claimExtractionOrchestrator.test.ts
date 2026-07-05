import { describe, expect, it } from "vitest"

import type { ClaimProvider, ExtractedClaim } from "../../src/ai/types"
import { extractClaimsWithFallback } from "../../src/background/claimExtractionOrchestrator"
import { createChunkId, createDocumentId, type ChunkRecord } from "../../src/shared/types"

function buildChunk(index: number): ChunkRecord {
  const text =
    `Chunk ${index}. ` +
    "This section contains a long-form article paragraph about product updates, rollout details, and implementation tradeoffs. ".repeat(
      4
    )

  return {
    chunkId: createChunkId(`doc_claim_chunk_${index}`),
    docId: createDocumentId("doc_claim"),
    text,
    startOffset: index * 500,
    endOffset: index * 500 + text.length,
    charCount: text.length,
    createdAt: index
  }
}

class RecursiveRetryClaimProvider implements ClaimProvider {
  readonly calls: number[] = []

  async extractClaims(input: {
    readonly docId: string
    readonly chunks: readonly { readonly chunkId: ReturnType<typeof createChunkId>; readonly text: string }[]
    readonly model: string
    readonly provider: string
  }): Promise<readonly ExtractedClaim[]> {
    this.calls.push(input.chunks.length)

    if (input.chunks.length >= 4) {
      throw new Error("batch too large")
    }

    return input.chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      text: `Claim for ${chunk.chunkId}`,
      type: "fact",
      importance: 0.8 - index * 0.05,
      confidence: 0.9,
      entities: []
    }))
  }
}

class PerChunkFallbackClaimProvider implements ClaimProvider {
  readonly calls: number[] = []

  async extractClaims(input: {
    readonly docId: string
    readonly chunks: readonly { readonly chunkId: ReturnType<typeof createChunkId>; readonly text: string }[]
    readonly model: string
    readonly provider: string
  }): Promise<readonly ExtractedClaim[]> {
    this.calls.push(input.chunks.length)

    if (input.chunks.length > 1) {
      throw new Error("multi chunk extraction failed")
    }

    const chunk = input.chunks[0]

    if (chunk === undefined) {
      return []
    }

    return [
      {
        chunkId: chunk.chunkId,
        text: `Claim for ${chunk.chunkId}`,
        type: "fact",
        importance: 0.7,
        confidence: 0.88,
        entities: []
      }
    ]
  }
}

describe("extractClaimsWithFallback", () => {
  it("recursively splits failed batches and preserves successful claims", async () => {
    const provider = new RecursiveRetryClaimProvider()
    const progressEvents: number[] = []

    const result = await extractClaimsWithFallback({
      claimProvider: provider,
      chunks: Array.from({ length: 6 }, (_, index) => buildChunk(index + 1)),
      docId: createDocumentId("doc_claim"),
      model: "gpt-4.1-mini",
      provider: "openai",
      onProgress(progress) {
        progressEvents.push(progress.completedBatches)
      }
    })

    expect(result.claims).toHaveLength(6)
    expect(result.failedChunkIds).toEqual([])
    expect(provider.calls.some((callSize) => callSize > 2)).toBe(true)
    expect(provider.calls.filter((callSize) => callSize === 2).length).toBeGreaterThanOrEqual(2)
    expect(progressEvents.at(-1)).toBe(result.totalBatches)
  })

  it("falls back to single-chunk extraction when every multi-chunk batch fails", async () => {
    const provider = new PerChunkFallbackClaimProvider()

    const result = await extractClaimsWithFallback({
      claimProvider: provider,
      chunks: Array.from({ length: 3 }, (_, index) => buildChunk(index + 1)),
      docId: createDocumentId("doc_claim"),
      model: "gpt-4.1-mini",
      provider: "openai"
    })

    expect(result.claims).toHaveLength(3)
    expect(result.failedChunkIds).toEqual([])
    expect(provider.calls.some((callSize) => callSize > 1)).toBe(true)
    expect(provider.calls.filter((callSize) => callSize === 1)).toHaveLength(3)
  })
})
