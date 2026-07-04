import { describe, expect, it } from "vitest"

import { cosineSimilarity, rankBySimilarity } from "../../src/core/similarity"
import { createClaimId } from "../../src/shared/types"

describe("similarity helpers", () => {
  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
  })

  it("returns the highest similarity results first", () => {
    const ranked = rankBySimilarity([1, 0], [
      { targetId: createClaimId("claim_1"), vector: [1, 0] },
      { targetId: createClaimId("claim_2"), vector: [0.8, 0.2] },
      { targetId: createClaimId("claim_3"), vector: [0, 1] }
    ])

    expect(ranked[0]?.targetId).toBe(createClaimId("claim_1"))
    expect(ranked[2]?.targetId).toBe(createClaimId("claim_3"))
  })
})
