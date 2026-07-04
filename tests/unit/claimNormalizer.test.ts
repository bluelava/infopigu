import { describe, expect, it } from "vitest"

import { parseClaimExtractionResponse } from "../../src/core/claimNormalizer"
import { createChunkId, createDocumentId } from "../../src/shared/types"

describe("parseClaimExtractionResponse", () => {
  it("parses valid JSON claim output into normalized records", () => {
    const docId = createDocumentId("doc_1")
    const chunkId = createChunkId("chunk_1")

    const claims = parseClaimExtractionResponse({
      rawResponse: JSON.stringify({
        claims: [
          {
            text: "OpenAI 发布了一个新的浏览器插件。",
            type: "fact",
            importance: 0.8,
            confidence: 0.9,
            entities: ["OpenAI"],
            source_chunk_id: chunkId
          }
        ]
      }),
      docId,
      chunkIds: [chunkId],
      provider: "openai",
      model: "gpt-4.1-mini"
    })

    expect(claims).toHaveLength(1)
    expect(claims[0]?.docId).toBe(docId)
    expect(claims[0]?.chunkId).toBe(chunkId)
    expect(claims[0]?.type).toBe("fact")
  })

  it("rejects claims that reference unknown chunk identifiers", () => {
    expect(() =>
      parseClaimExtractionResponse({
        rawResponse: JSON.stringify({
          claims: [
            {
              text: "Bad mapping",
              type: "fact",
              importance: 0.2,
              confidence: 0.4,
              entities: [],
              source_chunk_id: "chunk_missing"
            }
          ]
        }),
        docId: createDocumentId("doc_2"),
        chunkIds: [createChunkId("chunk_known")],
        provider: "openai",
        model: "gpt-4.1-mini"
      })
    ).toThrow("Unknown chunk id")
  })
})
