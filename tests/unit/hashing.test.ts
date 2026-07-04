import { describe, expect, it } from "vitest"

import { hashContentParts } from "../../src/core/hashing"

describe("hashContentParts", () => {
  it("returns the same hash for the same content", async () => {
    const firstHash = await hashContentParts(["title", "paragraph one"])
    const secondHash = await hashContentParts(["title", "paragraph one"])

    expect(firstHash).toBe(secondHash)
  })

  it("returns a different hash when content changes", async () => {
    const firstHash = await hashContentParts(["title", "paragraph one"])
    const secondHash = await hashContentParts(["title", "paragraph two"])

    expect(secondHash).not.toBe(firstHash)
  })
})
