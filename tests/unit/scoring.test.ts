import { describe, expect, it } from "vitest"

import {
  classifyClaimMatch,
  computeAnalysisScores,
  createRecommendationLabel
} from "../../src/core/scoring"

describe("scoring helpers", () => {
  it("classifies claim match state from similarity thresholds", () => {
    expect(classifyClaimMatch(0.9)).toBe("duplicate")
    expect(classifyClaimMatch(0.8)).toBe("similar")
    expect(classifyClaimMatch(0.5)).toBe("novel")
  })

  it("computes duplicate score, novelty score, and recommendation", () => {
    const result = computeAnalysisScores([
      { importance: 0.7, bestSimilarity: 0.91 },
      { importance: 0.2, bestSimilarity: 0.3 },
      { importance: 0.1, bestSimilarity: 0.8 }
    ])

    expect(result.duplicateScore).toBeCloseTo(0.7)
    expect(result.noveltyScore).toBeCloseTo(0.2)
    expect(result.recommendation).toBe("skim")
    expect(createRecommendationLabel(result.recommendation)).toBe("建议略读")
  })
})
