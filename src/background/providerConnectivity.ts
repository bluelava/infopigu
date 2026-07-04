import {
  createBigModelClaimProvider,
  createBigModelEmbeddingProvider
} from "../ai/bigmodelProvider"
import { createCustomOpenAiClaimProvider, createCustomOpenAiEmbeddingProvider } from "../ai/customOpenAIProvider"
import { createDeepSeekClaimProvider } from "../ai/deepseekProvider"
import { createOpenAiClaimProvider, createOpenAiEmbeddingProvider } from "../ai/openaiProvider"
import type { ClaimProvider, EmbeddingProvider, FetchImplementation } from "../ai/types"
import { createChunkId, createDocumentId, type ProviderConfig } from "../shared/types"

interface ProviderConnectivityInput {
  readonly config: ProviderConfig
  readonly embeddingModel?: string
  readonly claimModel: string
  readonly apiKey: string
  readonly fetchImplementation?: FetchImplementation
}

export interface ProviderConnectivityResult {
  readonly claimStatus: "ok" | "error" | "skipped"
  readonly embeddingStatus: "ok" | "error" | "skipped"
  readonly isSuccess: boolean
  readonly message: string
}

function createClaimProvider(
  config: ProviderConfig,
  apiKey: string,
  fetchImplementation?: FetchImplementation
): ClaimProvider {
  const options =
    fetchImplementation === undefined
      ? { apiKey, baseUrl: config.baseUrl }
      : { apiKey, baseUrl: config.baseUrl, fetchImplementation }

  switch (config.type) {
    case "openai":
      return createOpenAiClaimProvider(options)
    case "bigmodel":
      return createBigModelClaimProvider(options)
    case "deepseek":
      return createDeepSeekClaimProvider(options)
    case "custom-openai-compatible":
      return createCustomOpenAiClaimProvider(options)
  }
}

function createEmbeddingProvider(
  config: ProviderConfig,
  apiKey: string,
  fetchImplementation?: FetchImplementation
): EmbeddingProvider | undefined {
  if (!config.supportsEmbedding) {
    return undefined
  }

  const options =
    fetchImplementation === undefined
      ? { apiKey, baseUrl: config.baseUrl }
      : { apiKey, baseUrl: config.baseUrl, fetchImplementation }

  switch (config.type) {
    case "openai":
      return createOpenAiEmbeddingProvider(options)
    case "bigmodel":
      return createBigModelEmbeddingProvider(options)
    case "deepseek":
      return undefined
    case "custom-openai-compatible":
      return createCustomOpenAiEmbeddingProvider(options)
  }
}

function createDirectConnectMessage(): string {
  return "当前供应商暂不支持浏览器插件直连。请更换模型供应商，或等待后续本地代理 / 云端版本支持。"
}

function mapProviderConnectivityErrorMessage(config: ProviderConfig, message: string): string {
  if (config.type === "bigmodel" && message.includes("401")) {
    return "智谱 API Key 校验失败 (401)。请检查你填写的 API Key 是否正确，或确认该 Key 仍然有效。"
  }

  if (
    message.includes("403") ||
    message.includes("CORS") ||
    message.includes("Failed to fetch")
  ) {
    return createDirectConnectMessage()
  }

  return message
}

export async function testProviderConnectivity(
  input: ProviderConnectivityInput
): Promise<ProviderConnectivityResult> {
  const claimProvider = createClaimProvider(input.config, input.apiKey, input.fetchImplementation)
  const embeddingProvider = createEmbeddingProvider(
    input.config,
    input.apiKey,
    input.fetchImplementation
  )

  try {
    if (embeddingProvider !== undefined && input.embeddingModel !== undefined) {
      await embeddingProvider.embed({
        texts: ["connectivity test"],
        model: input.embeddingModel
      })
    }

    await claimProvider.extractClaims({
      docId: createDocumentId("connectivity_doc"),
      chunks: [
        {
          chunkId: createChunkId("connectivity_chunk"),
          text: "请返回一个空的 claims 数组。"
        }
      ],
      model: input.claimModel,
      provider: input.config.type
    })

    return {
      claimStatus: "ok",
      embeddingStatus:
        embeddingProvider !== undefined && input.embeddingModel !== undefined ? "ok" : "skipped",
      isSuccess: true,
      message: "连接测试通过"
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provider error"

    return {
      claimStatus: "error",
      embeddingStatus:
        embeddingProvider !== undefined && input.embeddingModel !== undefined ? "error" : "skipped",
      isSuccess: false,
      message: mapProviderConnectivityErrorMessage(input.config, message)
    }
  }
}
