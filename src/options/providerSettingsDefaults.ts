import type { ProviderType } from "../shared/types"

export const providerDefaults: Record<
  ProviderType,
  {
    readonly baseUrl: string
    readonly chatModels: string
    readonly embeddingModels: string
    readonly name: string
  }
> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    chatModels: "gpt-4.1-mini",
    embeddingModels: "text-embedding-3-small",
    name: "OpenAI"
  },
  bigmodel: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    chatModels: "glm-5",
    embeddingModels: "embedding-3",
    name: "BigModel"
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    chatModels: "deepseek-chat",
    embeddingModels: "",
    name: "DeepSeek"
  },
  "custom-openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    chatModels: "gpt-4.1-mini",
    embeddingModels: "text-embedding-3-small",
    name: "OpenAI-Compatible"
  }
}
