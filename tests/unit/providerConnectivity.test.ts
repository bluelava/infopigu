import { describe, expect, it } from "vitest"

import { testProviderConnectivity } from "../../src/background/providerConnectivity"
import { createProviderId } from "../../src/shared/types"

describe("testProviderConnectivity", () => {
  it("reports success when embedding and claim endpoints respond correctly", async () => {
    const result = await testProviderConnectivity({
      config: {
        id: createProviderId("provider_openai"),
        name: "OpenAI",
        type: "openai",
        baseUrl: "https://api.openai.com/v1",
        embeddingModels: ["text-embedding-3-small"],
        chatModels: ["gpt-4.1-mini"],
        supportsEmbedding: true,
        supportsChat: true,
        createdAt: 1,
        updatedAt: 1
      },
      embeddingModel: "text-embedding-3-small",
      claimModel: "gpt-4.1-mini",
      apiKey: "sk-test",
      fetchImplementation: async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : input.toString()

        if (url.endsWith("/embeddings")) {
          return new Response(
            JSON.stringify({
              data: [{ embedding: [0.1, 0.2, 0.3] }]
            }),
            { status: 200 }
          )
        }

        if (url.endsWith("/chat/completions")) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      claims: []
                    })
                  }
                }
              ]
            }),
            { status: 200 }
          )
        }

        throw new Error(`Unexpected URL: ${url} ${init?.method ?? ""}`)
      }
    })

    expect(result.isSuccess).toBe(true)
    expect(result.embeddingStatus).toBe("ok")
    expect(result.claimStatus).toBe("ok")
  })

  it("reports unsupported direct-connect errors", async () => {
    const result = await testProviderConnectivity({
      config: {
        id: createProviderId("provider_custom"),
        name: "Custom",
        type: "custom-openai-compatible",
        baseUrl: "https://custom.example.com/v1",
        embeddingModels: ["embed"],
        chatModels: ["chat"],
        supportsEmbedding: true,
        supportsChat: true,
        createdAt: 1,
        updatedAt: 1
      },
      embeddingModel: "embed",
      claimModel: "chat",
      apiKey: "secret",
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: { message: "CORS blocked" } }), { status: 403 })
    })

    expect(result.isSuccess).toBe(false)
    expect(result.message).toContain("暂不支持浏览器插件直连")
  })

  it("maps bigmodel 401 responses to a credential-specific hint", async () => {
    const result = await testProviderConnectivity({
      config: {
        id: createProviderId("provider_bigmodel"),
        name: "BigModel",
        type: "bigmodel",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        embeddingModels: ["embedding-3"],
        chatModels: ["glm-5"],
        supportsEmbedding: true,
        supportsChat: true,
        createdAt: 1,
        updatedAt: 1
      },
      embeddingModel: "embedding-3",
      claimModel: "glm-5",
      apiKey: "invalid-key",
      fetchImplementation: async () =>
        new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 })
    })

    expect(result.isSuccess).toBe(false)
    expect(result.message).toContain("智谱")
    expect(result.message).toContain("API Key")
    expect(result.message).toContain("401")
  })
})
