import { describe, expect, it } from "vitest"

import {
  createOpenAiCompatibleClaimProvider,
  claimRequestTimeoutMs,
  embeddingRequestTimeoutMs
} from "../../src/ai/openaiCompatible"
import { createChunkId } from "../../src/shared/types"

describe("openai compatible providers", () => {
  it("uses a longer timeout for claim extraction than embedding requests", () => {
    expect(embeddingRequestTimeoutMs).toBe(10_000)
    expect(claimRequestTimeoutMs).toBeGreaterThan(embeddingRequestTimeoutMs)
    expect(claimRequestTimeoutMs).toBeGreaterThanOrEqual(90_000)
  })

  it("normalizes loosely typed claim responses", async () => {
    const provider = createOpenAiCompatibleClaimProvider({
      apiKey: "sk-test",
      baseUrl: "https://api.example.com/v1",
      fetchImplementation: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    claims: [
                      {
                        text: { value: "一条 claim" },
                        type: "fact",
                        importance: 0.8,
                        confidence: 0.9,
                        entities: "OpenAI, GPT",
                        source_chunk_id: { value: "chunk_1" }
                      }
                    ]
                  })
                }
              }
            ]
          }),
          { status: 200 }
        )
    })

    const claims = await provider.extractClaims({
      docId: "doc_1",
      chunks: [
        {
          chunkId: createChunkId("chunk_1"),
          text: "原文内容"
        }
      ],
      model: "glm-5",
      provider: "bigmodel"
    })

    expect(claims).toEqual([
      {
        chunkId: createChunkId("chunk_1"),
        text: "一条 claim",
        type: "fact",
        importance: 0.8,
        confidence: 0.9,
        entities: ["OpenAI", "GPT"]
      }
    ])
  })
})
