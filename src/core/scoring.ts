import type { Recommendation } from "../shared/types"

const DUPLICATE_THRESHOLD = 0.88
const SIMILAR_THRESHOLD = 0.78
const HIGH_IMPORTANCE_THRESHOLD = 0.6
const MEDIUM_IMPORTANCE_THRESHOLD = 0.35

export type ClaimMatchState = "duplicate" | "similar" | "novel"

export interface ScoreableClaim {
  readonly importance: number
  readonly bestSimilarity: number
}

export interface AnalysisScores {
  readonly duplicateScore: number
  readonly noveltyScore: number
  readonly recommendation: Recommendation
}

export function classifyClaimMatch(similarity: number): ClaimMatchState {
  if (similarity >= DUPLICATE_THRESHOLD) {
    return "duplicate"
  }

  if (similarity >= SIMILAR_THRESHOLD) {
    return "similar"
  }

  return "novel"
}

function createRecommendation(
  duplicateScore: number,
  novelImportance: readonly number[]
): Recommendation {
  const hasHighImportanceNovelClaim = novelImportance.some(
    (importance) => importance >= HIGH_IMPORTANCE_THRESHOLD
  )
  const hasMediumImportanceNovelClaim = novelImportance.some(
    (importance) => importance >= MEDIUM_IMPORTANCE_THRESHOLD
  )

  if (duplicateScore >= 0.75 && !hasHighImportanceNovelClaim) {
    return "skip"
  }

  if (duplicateScore < 0.45 || hasHighImportanceNovelClaim) {
    return "read"
  }

  if (duplicateScore <= 0.75 || hasMediumImportanceNovelClaim) {
    return "skim"
  }

  return "read"
}

export function computeAnalysisScores(claims: readonly ScoreableClaim[]): AnalysisScores {
  const totalImportance = claims.reduce((sum, claim) => sum + claim.importance, 0)

  if (totalImportance === 0) {
    return {
      duplicateScore: 0,
      noveltyScore: 0,
      recommendation: "read"
    }
  }

  const duplicateImportance = claims
    .filter((claim) => classifyClaimMatch(claim.bestSimilarity) === "duplicate")
    .reduce((sum, claim) => sum + claim.importance, 0)

  const novelClaims = claims.filter((claim) => classifyClaimMatch(claim.bestSimilarity) === "novel")
  const noveltyImportance = novelClaims.reduce((sum, claim) => sum + claim.importance, 0)

  const duplicateScore = duplicateImportance / totalImportance
  const noveltyScore = noveltyImportance / totalImportance

  return {
    duplicateScore,
    noveltyScore,
    recommendation: createRecommendation(
      duplicateScore,
      novelClaims.map((claim) => claim.importance)
    )
  }
}

export function createRecommendationLabel(recommendation: Recommendation): string {
  switch (recommendation) {
    case "skip":
      return "建议跳过"
    case "skim":
      return "建议略读"
    case "read":
      return "建议阅读"
  }
}
