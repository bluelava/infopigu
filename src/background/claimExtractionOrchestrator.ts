import type { ClaimProvider, ExtractedClaim } from "../ai/types"
import { planClaimExtractionBatches } from "./claimBatchPlanner"
import { dedupeExtractedClaims } from "../core/claimDeduper"
import type { ChunkRecord, ChunkId, DocumentId } from "../shared/types"

export interface ClaimExtractionProgress {
  readonly completedBatches: number
  readonly failedChunkCount: number
  readonly pendingBatches: number
  readonly totalBatches: number
}

interface ExtractClaimsWithFallbackInput {
  readonly claimProvider: ClaimProvider
  readonly chunks: readonly ChunkRecord[]
  readonly docId: DocumentId
  readonly model: string
  readonly provider: string
  readonly onProgress?: (progress: ClaimExtractionProgress) => Promise<void> | void
}

interface ExtractClaimsWithFallbackResult {
  readonly claims: readonly ExtractedClaim[]
  readonly failedChunkIds: readonly ChunkId[]
  readonly totalBatches: number
}

async function publishProgress(
  input: ExtractClaimsWithFallbackInput,
  state: {
    readonly completedBatches: number
    readonly failedChunkIds: readonly ChunkId[]
    readonly pendingBatches: number
    readonly totalBatches: number
  }
): Promise<void> {
  await input.onProgress?.({
    completedBatches: state.completedBatches,
    failedChunkCount: state.failedChunkIds.length,
    pendingBatches: state.pendingBatches,
    totalBatches: state.totalBatches
  })
}

export async function extractClaimsWithFallback(
  input: ExtractClaimsWithFallbackInput
): Promise<ExtractClaimsWithFallbackResult> {
  const initialBatches = planClaimExtractionBatches({
    chunks: input.chunks
  }).map((batch) => [...batch.chunks])
  const pendingBatches = [...initialBatches]
  const extractedClaims: ExtractedClaim[] = []
  const failedChunkIds: ChunkId[] = []
  let totalBatches = pendingBatches.length
  let completedBatches = 0

  while (pendingBatches.length > 0) {
    const activeBatch = pendingBatches.shift()

    if (activeBatch === undefined) {
      continue
    }

    try {
      const claims = await input.claimProvider.extractClaims({
        docId: input.docId,
        chunks: activeBatch,
        model: input.model,
        provider: input.provider
      })

      extractedClaims.push(...claims)
      completedBatches += 1
      await publishProgress(input, {
        completedBatches,
        failedChunkIds,
        pendingBatches: pendingBatches.length,
        totalBatches
      })
      continue
    } catch {
      if (activeBatch.length > 1) {
        const middle = Math.ceil(activeBatch.length / 2)
        const leftBatch = activeBatch.slice(0, middle)
        const rightBatch = activeBatch.slice(middle)

        pendingBatches.unshift(rightBatch)
        pendingBatches.unshift(leftBatch)
        totalBatches += 1
        await publishProgress(input, {
          completedBatches,
          failedChunkIds,
          pendingBatches: pendingBatches.length,
          totalBatches
        })
        continue
      }

      const failedChunk = activeBatch[0]

      if (failedChunk !== undefined) {
        failedChunkIds.push(failedChunk.chunkId)
      }

      completedBatches += 1
      await publishProgress(input, {
        completedBatches,
        failedChunkIds,
        pendingBatches: pendingBatches.length,
        totalBatches
      })
    }
  }

  return {
    claims: dedupeExtractedClaims(extractedClaims),
    failedChunkIds,
    totalBatches
  }
}
