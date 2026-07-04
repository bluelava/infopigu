import { describe, expect, it } from "vitest"

import { canPersistMoreDocuments, summarizeCapacity } from "../../src/core/capacity"

describe("capacity helpers", () => {
  it("prevents persistence when the document limit is reached", () => {
    expect(canPersistMoreDocuments(999, 1000)).toBe(true)
    expect(canPersistMoreDocuments(1000, 1000)).toBe(false)
  })

  it("summarizes capacity usage", () => {
    expect(summarizeCapacity(273, 1000)).toEqual({
      savedDocuments: 273,
      maxDocuments: 1000,
      remainingDocuments: 727,
      isFull: false
    })
  })
})
