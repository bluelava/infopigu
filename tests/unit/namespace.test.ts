import { describe, expect, it } from "vitest"

import { createEmbeddingNamespace, parseEmbeddingNamespace } from "../../src/core/namespace"

describe("embedding namespace helpers", () => {
  it("creates a stable namespace string", () => {
    expect(createEmbeddingNamespace("openai", "text-embedding-3-small", 1536)).toBe(
      "openai:text-embedding-3-small:1536"
    )
  })

  it("parses a namespace string into typed pieces", () => {
    expect(parseEmbeddingNamespace("openai:text-embedding-3-small:1536")).toEqual({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536
    })
  })
})
