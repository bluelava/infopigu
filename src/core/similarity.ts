import type { ClaimId } from "../shared/types"

export interface SimilarityCandidate {
  readonly targetId: ClaimId
  readonly vector: readonly number[]
}

export interface RankedSimilarityResult {
  readonly targetId: ClaimId
  readonly similarity: number
}

function vectorMagnitude(vector: readonly number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) {
    throw new Error("Vectors must have the same dimensions")
  }

  const leftMagnitude = vectorMagnitude(left)
  const rightMagnitude = vectorMagnitude(right)

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0
  }

  const dotProduct = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0)
  return dotProduct / (leftMagnitude * rightMagnitude)
}

export function rankBySimilarity(
  queryVector: readonly number[],
  candidates: readonly SimilarityCandidate[],
  topK = 5
): readonly RankedSimilarityResult[] {
  return candidates
    .map((candidate) => ({
      targetId: candidate.targetId,
      similarity: cosineSimilarity(queryVector, candidate.vector)
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK)
}
