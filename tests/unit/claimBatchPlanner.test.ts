import { describe, expect, it } from "vitest"

import { planClaimExtractionBatches } from "../../src/background/claimBatchPlanner"
import { createChunkId, createDocumentId, type ChunkRecord } from "../../src/shared/types"

function buildChunk(index: number, textLength = 420): ChunkRecord {
  const text = `chunk-${index} ` + "A".repeat(textLength)

  return {
    chunkId: createChunkId(`doc_long_chunk_${index}`),
    docId: createDocumentId("doc_long"),
    text,
    startOffset: index * text.length,
    endOffset: (index + 1) * text.length,
    charCount: text.length,
    createdAt: index
  }
}

describe("planClaimExtractionBatches", () => {
  it("splits oversized long-form chunk sets into multiple ordered batches", () => {
    const chunks = Array.from({ length: 24 }, (_, index) => buildChunk(index + 1))

    const batches = planClaimExtractionBatches({
      chunks,
      maxEstimatedTokensPerBatch: 1200,
      requestOverheadTokens: 250,
      maxChunksPerBatch: 6
    })

    expect(batches.length).toBeGreaterThan(1)
    expect(batches.flatMap((batch) => batch.chunks.map((chunk) => chunk.chunkId))).toEqual(
      chunks.map((chunk) => chunk.chunkId)
    )
    expect(
      batches.every(
        (batch) => batch.chunks.length > 0 && batch.estimatedTokens <= 1200 && batch.chunks.length <= 6
      )
    ).toBe(true)
  })
})
