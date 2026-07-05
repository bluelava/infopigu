import type { ChunkRecord } from "../shared/types"
import { estimateClaimRequestTokens, fitsWithinClaimRequestBudget } from "../core/textBudget"

export interface ClaimExtractionBatch {
  readonly batchIndex: number
  readonly chunkCount: number
  readonly chunks: readonly ChunkRecord[]
  readonly estimatedTokens: number
}

interface PlanClaimExtractionBatchesInput {
  readonly chunks: readonly ChunkRecord[]
  readonly maxEstimatedTokensPerBatch?: number
  readonly requestOverheadTokens?: number
  readonly maxChunksPerBatch?: number
}

const DEFAULT_MAX_ESTIMATED_TOKENS_PER_BATCH = 2200
const DEFAULT_REQUEST_OVERHEAD_TOKENS = 360
const DEFAULT_MAX_CHUNKS_PER_BATCH = 4

function createBatch(
  chunks: readonly ChunkRecord[],
  batchIndex: number,
  requestOverheadTokens: number
): ClaimExtractionBatch {
  return {
    batchIndex,
    chunkCount: chunks.length,
    chunks,
    estimatedTokens: estimateClaimRequestTokens({
      chunkTexts: chunks.map((chunk) => chunk.text),
      requestOverheadTokens
    })
  }
}

export function planClaimExtractionBatches(
  input: PlanClaimExtractionBatchesInput
): readonly ClaimExtractionBatch[] {
  const maxEstimatedTokensPerBatch =
    input.maxEstimatedTokensPerBatch ?? DEFAULT_MAX_ESTIMATED_TOKENS_PER_BATCH
  const requestOverheadTokens = input.requestOverheadTokens ?? DEFAULT_REQUEST_OVERHEAD_TOKENS
  const maxChunksPerBatch = input.maxChunksPerBatch ?? DEFAULT_MAX_CHUNKS_PER_BATCH

  if (input.chunks.length === 0) {
    return []
  }

  const batches: ClaimExtractionBatch[] = []
  let activeChunks: ChunkRecord[] = []

  function flush(): void {
    if (activeChunks.length === 0) {
      return
    }

    batches.push(createBatch(activeChunks, batches.length + 1, requestOverheadTokens))
    activeChunks = []
  }

  for (const chunk of input.chunks) {
    const candidateChunks = [...activeChunks, chunk]

    const withinBudget =
      candidateChunks.length <= maxChunksPerBatch &&
      fitsWithinClaimRequestBudget({
        chunkTexts: candidateChunks.map((candidate) => candidate.text),
        maxEstimatedTokensPerBatch,
        requestOverheadTokens
      })

    if (activeChunks.length > 0 && !withinBudget) {
      flush()
    }

    activeChunks.push(chunk)

    if (
      activeChunks.length >= maxChunksPerBatch ||
      !fitsWithinClaimRequestBudget({
        chunkTexts: activeChunks.map((candidate) => candidate.text),
        maxEstimatedTokensPerBatch,
        requestOverheadTokens
      })
    ) {
      flush()
    }
  }

  flush()

  return batches
}
