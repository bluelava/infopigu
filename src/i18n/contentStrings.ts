import type { AnalysisPipelineResult } from "../background/analysisPipeline"
import type { Recommendation } from "../shared/types"
import { translateRuntime } from "./runtimeLocale"

export function getRecommendationLabel(recommendation: Recommendation): string {
  if (recommendation === "skip") {
    return translateRuntime("content.recommendation.skip")
  }

  if (recommendation === "skim") {
    return translateRuntime("content.recommendation.skim")
  }

  return translateRuntime("content.recommendation.read")
}

export function formatDuplicateSummary(duplicateScore: number): string {
  return translateRuntime("content.duplicateScore", {
    score: Math.round(duplicateScore * 100)
  })
}

export function formatDuplicateRecommendation(
  duplicateScore: number,
  recommendation: Recommendation
): string {
  return translateRuntime("content.duplicateRecommendation", {
    recommendation: getRecommendationLabel(recommendation),
    score: Math.round(duplicateScore * 100)
  })
}

export function formatAnalysisRecommendation(result: AnalysisPipelineResult): string {
  if (result.judgement === "insufficient-content" || result.result.judgement === "insufficient-content") {
    return translateRuntime("content.insufficient")
  }

  return formatDuplicateRecommendation(result.result.duplicateScore, result.result.recommendation)
}

export function formatAnalysisError(error: unknown): string {
  if (error instanceof Error && error.message.includes("TimeoutError")) {
    return translateRuntime("content.analysisTimeout")
  }

  return translateRuntime("content.analysisFailed")
}
