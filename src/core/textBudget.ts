export function estimateTokenCount(text: string): number {
  const normalized = text.replace(/\s+/gu, " ").trim()

  if (normalized.length === 0) {
    return 0
  }

  return Math.ceil(normalized.length / 3)
}

export function estimateChunkPayloadTokens(text: string): number {
  return estimateTokenCount(text) + 24
}

export function estimateClaimRequestTokens(input: {
  readonly chunkTexts: readonly string[]
  readonly requestOverheadTokens?: number
}): number {
  const requestOverheadTokens = input.requestOverheadTokens ?? 360

  return (
    requestOverheadTokens +
    input.chunkTexts.reduce((sum, text) => sum + estimateChunkPayloadTokens(text), 0)
  )
}

export function fitsWithinClaimRequestBudget(input: {
  readonly chunkTexts: readonly string[]
  readonly maxEstimatedTokensPerBatch: number
  readonly requestOverheadTokens?: number
}): boolean {
  const estimatedTokens =
    input.requestOverheadTokens === undefined
      ? estimateClaimRequestTokens({
          chunkTexts: input.chunkTexts
        })
      : estimateClaimRequestTokens({
          chunkTexts: input.chunkTexts,
          requestOverheadTokens: input.requestOverheadTokens
        })

  return estimatedTokens <= input.maxEstimatedTokensPerBatch
}
